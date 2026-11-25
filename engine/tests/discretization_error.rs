//! Discretization-error estimation (testing/docs/DISCRETIZATION.md): the
//! Zienkiewicz–Zhu/SPR estimator's effectivity index and the Richardson-extrapolated
//! convergence check, on benchmarks with known solutions.
//!
//! The effectivity index is θ = η / ‖u − u_h‖_E, with the true energy-norm error from the
//! energy identity ‖u − u_h‖²_E = ‖u‖²_E − ‖u_h‖²_E (Galerkin orthogonality), ‖u_h‖²_E = u_hᵀ K u_h
//! summed element by element, and ‖u‖²_E either closed form (Navier series) or the
//! Richardson-extrapolated limit of ‖u_h‖²_E over a refinement sequence.

#[path = "benchmarks/macneal_harder.rs"]
mod mh;
use dedaliano_engine::postprocess::discretization::convergence::{convergence_study_3d, governing, is_inconclusive, member_moment_max, quantity_convergence, richardson, ConvergenceOptions};
use dedaliano_engine::postprocess::discretization::adapt::{adapt_3d, marked, AdaptOptions};
use dedaliano_engine::postprocess::discretization::refine::{hanging_nodes, refine_marked, refine_uniform, ElementKey, GeometryMode};
use dedaliano_engine::postprocess::discretization::{estimate_3d, DiscretizationEstimate};
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use std::collections::HashMap;
use std::f64::consts::PI;

// ==================== Model building ====================

#[derive(Clone, Copy, PartialEq, Debug)]
enum Fam {
    Dkt,
    Mitc4,
    Mitc9,
    Curved,
    Solid,
}

#[derive(Clone, Copy)]
enum Load {
    /// Pressure on every element (force per area, along the element normal).
    Pressure(f64),
    /// Gravity: force per unit area of mid-surface along global (gx, gy, gz).
    Weight([f64; 3]),
    /// Point forces at corner-grid nodes (i, j).
    None,
}

struct Model {
    input: SolverInput3D,
    /// Mid-surface node ids on the corner grid (i in 0..=nx, j in 0..=ny); for solid-shells the
    /// (bottom, top) pair.
    grid: Vec<Vec<(usize, usize)>>,
}

fn support(node_id: usize, f: [bool; 6]) -> SolverSupport3D {
    SolverSupport3D {
        node_id, rx: f[0], ry: f[1], rz: f[2], rrx: f[3], rry: f[4], rrz: f[5],
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
    }
}

fn empty_input() -> SolverInput3D {
    SolverInput3D {
        solver_options: None, masses: Default::default(), nodes: HashMap::new(), materials: HashMap::new(), sections: HashMap::new(),
        elements: HashMap::new(), supports: HashMap::new(), loads: vec![], constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(),
        curved_shells: HashMap::new(), curved_beams: vec![], connectors: HashMap::new(),
    }
}

/// A structured nx × ny surface mesh of `fam` on the map (u, v) ∈ [0,1]² → (point, unit normal).
/// `bc(i, j)` gives the restraints of the corner-grid node (i, j) (and of the in-between nodes of
/// MITC9 meshes, by the nearest even index along a restrained edge).
fn surface(
    fam: Fam, nx: usize, ny: usize, t: f64, e_mpa: f64, nu: f64,
    map: &dyn Fn(f64, f64) -> ([f64; 3], [f64; 3]),
    bc: &dyn Fn(usize, usize, usize, usize) -> Option<[bool; 6]>,
    load: Load,
) -> Model {
    let mut input = empty_input();
    input.materials.insert("1".into(), SolverMaterial { id: 1, e: e_mpa, nu });
    // Node lattice: MITC9 needs (2nx+1)×(2ny+1).
    let k = if fam == Fam::Mitc9 { 2 } else { 1 };
    let (mx, my) = (k * nx, k * ny);
    let mut lat = vec![vec![(0usize, 0usize); my + 1]; mx + 1];
    let mut nid = 1;
    for i in 0..=mx {
        for j in 0..=my {
            let (p, n) = map(i as f64 / mx as f64, j as f64 / my as f64);
            if fam == Fam::Solid {
                let b = [p[0] - 0.5 * t * n[0], p[1] - 0.5 * t * n[1], p[2] - 0.5 * t * n[2]];
                let tp = [p[0] + 0.5 * t * n[0], p[1] + 0.5 * t * n[1], p[2] + 0.5 * t * n[2]];
                input.nodes.insert(nid.to_string(), SolverNode3D { id: nid, x: b[0], y: b[1], z: b[2] });
                input.nodes.insert((nid + 1).to_string(), SolverNode3D { id: nid + 1, x: tp[0], y: tp[1], z: tp[2] });
                lat[i][j] = (nid, nid + 1);
                nid += 2;
            } else {
                input.nodes.insert(nid.to_string(), SolverNode3D { id: nid, x: p[0], y: p[1], z: p[2] });
                lat[i][j] = (nid, nid);
                nid += 1;
            }
        }
    }
    let mut eid = 1;
    let mut eids = Vec::new();
    for i in 0..nx {
        for j in 0..ny {
            match fam {
                Fam::Dkt => {
                    let (a, b, c, d) = (lat[i][j].0, lat[i + 1][j].0, lat[i + 1][j + 1].0, lat[i][j + 1].0);
                    for nodes in [[a, b, c], [a, c, d]] {
                        input.plates.insert(eid.to_string(), SolverPlateElement { id: eid, nodes, material_id: 1, thickness: t });
                        eids.push(eid);
                        eid += 1;
                    }
                }
                Fam::Mitc4 | Fam::Curved => {
                    let nodes = [lat[i][j].0, lat[i + 1][j].0, lat[i + 1][j + 1].0, lat[i][j + 1].0];
                    if fam == Fam::Mitc4 {
                        input.quads.insert(eid.to_string(), SolverQuadElement { id: eid, nodes, material_id: 1, thickness: t });
                    } else {
                        let normals = Some([(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
                            .map(|(a, b)| map(a as f64 / nx as f64, b as f64 / ny as f64).1));
                        input.curved_shells.insert(eid.to_string(), SolverCurvedShellElement { id: eid, nodes, material_id: 1, thickness: t, normals });
                    }
                    eids.push(eid);
                    eid += 1;
                }
                Fam::Mitc9 => {
                    let (a, b) = (2 * i, 2 * j);
                    let at = |di: usize, dj: usize| lat[a + di][b + dj].0;
                    let nodes = [at(0, 0), at(2, 0), at(2, 2), at(0, 2), at(1, 0), at(2, 1), at(1, 2), at(0, 1), at(1, 1)];
                    input.quad9s.insert(eid.to_string(), SolverQuad9Element { id: eid, nodes, material_id: 1, thickness: t });
                    eids.push(eid);
                    eid += 1;
                }
                Fam::Solid => {
                    let c = [lat[i][j], lat[i + 1][j], lat[i + 1][j + 1], lat[i][j + 1]];
                    let nodes = [c[0].0, c[1].0, c[2].0, c[3].0, c[0].1, c[1].1, c[2].1, c[3].1];
                    input.solid_shells.insert(eid.to_string(), SolverSolidShellElement { id: eid, nodes, material_id: 1 });
                    eids.push(eid);
                    eid += 1;
                }
            }
        }
    }
    let mut sid = 1;
    for i in 0..=mx {
        for j in 0..=my {
            if let Some(f) = bc(i, j, mx, my) {
                let (b, tp) = lat[i][j];
                for n in if b == tp { vec![b] } else { vec![b, tp] } {
                    input.supports.insert(sid.to_string(), support(n, f));
                    sid += 1;
                }
            }
        }
    }
    for &id in &eids {
        let l = match load {
            Load::Pressure(q) => {
                let p = SolverPressureLoad { element_id: id, pressure: q };
                match fam {
                    Fam::Dkt => SolverLoad3D::Pressure(p),
                    Fam::Mitc4 => SolverLoad3D::QuadPressure(p),
                    Fam::Mitc9 => SolverLoad3D::Quad9Pressure(p),
                    Fam::Curved => SolverLoad3D::CurvedShellPressure(p),
                    Fam::Solid => SolverLoad3D::SolidShellPressure(p),
                }
            }
            Load::Weight(g) => {
                // Force per area w = ρ/1000 · t · g  ⇒  ρ = 1000 / t per unit of g.
                let rho = 1000.0 / t;
                let sw = SolverQuadSelfWeightLoad { element_id: id, density: rho, gx: g[0], gy: g[1], gz: g[2] };
                match fam {
                    Fam::Mitc4 => SolverLoad3D::QuadSelfWeight(sw),
                    Fam::Mitc9 => SolverLoad3D::Quad9SelfWeight(sw),
                    Fam::Curved => SolverLoad3D::CurvedShellSelfWeight(sw),
                    _ => panic!("self-weight not built for {fam:?}"),
                }
            }
            Load::None => continue,
        };
        input.loads.push(l);
    }
    let grid = (0..=nx).map(|i| (0..=ny).map(|j| lat[k * i][k * j]).collect()).collect();
    Model { input, grid }
}

fn nodal(node_id: usize, f: [f64; 3]) -> SolverLoad3D {
    SolverLoad3D::Nodal(SolverNodalLoad3D { node_id, fx: f[0], fy: f[1], fz: f[2], mx: 0.0, my: 0.0, mz: 0.0, bw: None })
}

// ==================== Energy ====================

/// ‖u_h‖²_E = Σ_e u_eᵀ K_e u_e over the shell-type elements, with each family's own stiffness.
fn energy_norm_sq(input: &SolverInput3D, r: &AnalysisResults3D) -> f64 {
    use dedaliano_engine::element::{self, curved_shell, quad, quad9, solid_shell};
    let c: HashMap<usize, [f64; 3]> = input.nodes.values().map(|n| (n.id, [n.x, n.y, n.z])).collect();
    let u: HashMap<usize, [f64; 6]> = r.displacements.iter().map(|d| (d.node_id, [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz])).collect();
    let mat = &input.materials["1"];
    let (e, nu) = (mat.e * 1000.0, mat.nu);
    let quadform = |k: &[f64], v: &[f64]| -> f64 {
        let n = v.len();
        let mut s = 0.0;
        for i in 0..n {
            for j in 0..n {
                s += v[i] * k[i * n + j] * v[j];
            }
        }
        s
    };
    let ug = |ids: &[usize]| -> Vec<f64> { ids.iter().flat_map(|id| u[id]).collect() };
    let mut w = 0.0;
    for p in input.plates.values() {
        let x = [c[&p.nodes[0]], c[&p.nodes[1]], c[&p.nodes[2]]];
        let t = element::plate_transform_3d(&x);
        let ul = dedaliano_engine::linalg::transform_displacement(&ug(&p.nodes), &t, 18);
        w += quadform(&element::plate_local_stiffness(&x, e, nu, p.thickness), &ul);
    }
    for q in input.quads.values() {
        let x = [c[&q.nodes[0]], c[&q.nodes[1]], c[&q.nodes[2]], c[&q.nodes[3]]];
        let t = quad::quad_transform_3d(&x);
        let ul = dedaliano_engine::linalg::transform_displacement(&ug(&q.nodes), &t, 24);
        w += quadform(&quad::mitc4_local_stiffness(&x, e, nu, q.thickness), &ul);
    }
    for q in input.quad9s.values() {
        let mut x = [[0.0; 3]; 9];
        for (i, n) in q.nodes.iter().enumerate() { x[i] = c[n]; }
        let t = quad9::quad9_transform_3d(&x);
        let ul = dedaliano_engine::linalg::transform_displacement(&ug(&q.nodes), &t, 54);
        w += quadform(&quad9::mitc9_local_stiffness(&x, e, nu, q.thickness), &ul);
    }
    for q in input.curved_shells.values() {
        let x = [c[&q.nodes[0]], c[&q.nodes[1]], c[&q.nodes[2]], c[&q.nodes[3]]];
        let dirs = q.normals.unwrap_or_else(|| curved_shell::compute_element_directors(&x));
        w += quadform(&curved_shell::curved_shell_stiffness(&x, &dirs, e, nu, q.thickness), &ug(&q.nodes));
    }
    for s in input.solid_shells.values() {
        let mut x = [[0.0; 3]; 8];
        for (i, n) in s.nodes.iter().enumerate() { x[i] = c[n]; }
        let v: Vec<f64> = s.nodes.iter().flat_map(|id| u[id][..3].to_vec()).collect();
        w += quadform(&solid_shell::solid_shell_stiffness(&x, e, nu), &v);
    }
    w
}

fn solve(m: &SolverInput3D) -> AnalysisResults3D {
    linear::solve_3d(m).expect("solve")
}

fn disp(r: &AnalysisResults3D, id: usize) -> [f64; 3] {
    let d = r.displacements.iter().find(|d| d.node_id == id).expect("node");
    [d.ux, d.uy, d.uz]
}

/// Mid-surface displacement at a grid point (average of the faces for solid-shells).
fn mid_disp(r: &AnalysisResults3D, ids: (usize, usize)) -> [f64; 3] {
    let (a, b) = (disp(r, ids.0), disp(r, ids.1));
    [0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1]), 0.5 * (a[2] + b[2])]
}

fn estimate(m: &SolverInput3D, r: &AnalysisResults3D) -> DiscretizationEstimate {
    estimate_3d(m, r).expect("estimate")
}

// ==================== Benchmarks ====================

/// Square plate in the xy-plane, side a, simply supported (soft: w = 0 on the edges) or
/// clamped, uniform pressure q.
fn square_plate(fam: Fam, n: usize, clamped: bool) -> Model {
    let a = 1.0;
    let t = 0.01;
    let map = move |u: f64, v: f64| ([u * a, v * a, 0.0], [0.0, 0.0, 1.0]);
    let bc = move |i: usize, j: usize, mx: usize, my: usize| -> Option<[bool; 6]> {
        let edge = i == 0 || j == 0 || i == mx || j == my;
        if !edge {
            return None;
        }
        if clamped {
            return Some([true; 6]);
        }
        // Soft simple support plus in-plane pins at two corners.
        let pin = (i == 0 && j == 0, i == mx && j == 0);
        Some([pin.0, pin.0 || pin.1, true, false, false, false])
    };
    surface(fam, n, n, t, 200_000.0, 0.3, &map, &bc, Load::Pressure(-1.0))
}

fn plate_rigidity() -> f64 {
    let (e, t, nu) = (200_000.0 * 1000.0, 0.01_f64, 0.3);
    e * t.powi(3) / (12.0 * (1.0 - nu * nu))
}

/// Navier series for the simply supported square plate (side 1, q = 1): ‖u‖²_E = ∫ q w dA and
/// the centre deflection.
fn navier(d: f64) -> (f64, f64) {
    let (mut w_energy, mut wc) = (0.0, 0.0);
    for m in (1..400).step_by(2) {
        for n in (1..400).step_by(2) {
            let (mf, nf) = (m as f64, n as f64);
            let den = mf * nf * (mf * mf + nf * nf).powi(2);
            wc += 16.0 / (PI.powi(6) * d) / den * ((m / 2 + n / 2) % 2 == 0).then_some(1.0).unwrap_or(-1.0);
            w_energy += 64.0 / (PI.powi(8) * d) / (mf * mf * nf * nf * (mf * mf + nf * nf).powi(2));
        }
    }
    (w_energy, wc)
}

/// Richardson limit of a sequence on meshes h, h/2, h/4, which must be converging: never the
/// finest value standing in for an extrapolation.
fn extrapolate(v: &[f64]) -> (f64, Option<f64>) {
    let (p, ext, _, status) = richardson(v);
    assert_eq!(status, "converging", "{v:?}: no extrapolation");
    (ext.unwrap(), p)
}

/// Kirchhoff moments of the simply supported unit square plate under unit load (Navier series),
/// as a global tensor (Mxx, Myy, Mxy), sagging-positive.
fn navier_moments(x: f64, y: f64, nu: f64) -> [f64; 3] {
    let mut m = [0.0; 3];
    for i in (1..120).step_by(2) {
        for j in (1..120).step_by(2) {
            let (a, b) = (i as f64, j as f64);
            // w = Σ A sin(aπx) sin(bπy), A·D = 16/(π⁶ a b (a² + b²)²)
            let ad = 16.0 / (PI.powi(6) * a * b * (a * a + b * b).powi(2));
            let (sx, sy) = ((a * PI * x).sin(), (b * PI * y).sin());
            let (cx, cy) = ((a * PI * x).cos(), (b * PI * y).cos());
            m[0] += ad * PI * PI * (a * a + nu * b * b) * sx * sy;
            m[1] += ad * PI * PI * (b * b + nu * a * a) * sx * sy;
            m[2] -= ad * PI * PI * (1.0 - nu) * a * b * cx * cy;
        }
    }
    m
}

/// True bending-energy error ‖σ − σ_h‖ of a Navier plate solution, against the exact Kirchhoff
/// moments, over the same integration points and components the estimator uses. The load
/// direction and the twisting-moment sign convention are fixed by taking the sign choice that
/// fits the computed field best.
fn navier_true_error(m: &SolverInput3D, r: &AnalysisResults3D, t: f64, nu: f64) -> f64 {
    use dedaliano_engine::postprocess::discretization::samples::{energy_density, sample_elements, to_local};
    let elems = sample_elements(m, r).unwrap();
    let mut best = f64::INFINITY;
    for (s_m, s_t) in [(1.0, 1.0), (1.0, -1.0), (-1.0, 1.0), (-1.0, -1.0)] {
        let mut err = 0.0;
        for e in &elems {
            for smp in &e.samples {
                let mm = navier_moments(smp.pos[0], smp.pos[1], nu);
                // σ(z) = −12 M z / t³ (sagging-positive moments: tension at the bottom).
                let k = -12.0 * smp.pos[2] / t.powi(3);
                let g = [s_m * k * mm[0], s_m * k * mm[1], 0.0, s_m * s_t * k * mm[2], 0.0, 0.0];
                let ex = to_local(&smp.frame, &g);
                let d = [ex[0] - smp.sigma[0], ex[1] - smp.sigma[1], ex[2] - smp.sigma[2]];
                err += energy_density(&d, e.e, e.nu) * smp.weight;
            }
        }
        best = best.min(err);
    }
    best.sqrt()
}

/// Scordelis–Lo roof (quarter): R = 25, L = 50, 40°, t = 0.25, E = 4.32e8, ν = 0, weight 90
/// per unit area. Reference midspan free-edge vertical displacement 0.3024 (MacNeal–Harder).
fn scordelis(fam: Fam, n: usize) -> Model {
    let (r, half_l, th) = (25.0, 25.0, 40.0_f64.to_radians());
    let map = move |u: f64, v: f64| {
        let a = v * th;
        ([u * half_l, r * a.sin(), r * a.cos() - r], [0.0, a.sin(), a.cos()])
    };
    // i: along x (0 = midspan symmetry, max = diaphragm); j: around (0 = crown, max = free edge).
    let bc = |i: usize, j: usize, mx: usize, _my: usize| -> Option<[bool; 6]> {
        let mut f = [false; 6];
        if i == 0 { f[0] = true; f[4] = true; f[5] = true; }
        if i == mx { f[1] = true; f[2] = true; }
        if j == 0 { f[1] = true; f[3] = true; f[5] = true; }
        f.iter().any(|&b| b).then_some(f)
    };
    surface(fam, n, n, 0.25, 4.32e8 / 1000.0, 0.0, &map, &bc, Load::Weight([0.0, 0.0, -90.0]))
}

/// Refine `m` `levels` times (smooth geometry) and solve each; returns the inputs and results.
fn sequence(m: &SolverInput3D, levels: usize) -> Vec<(SolverInput3D, AnalysisResults3D)> {
    let mut inputs = vec![m.clone()];
    for _ in 0..levels {
        inputs.push(refine_uniform(inputs.last().unwrap(), GeometryMode::Smooth).unwrap().input);
    }
    inputs.into_iter().map(|i| { let r = solve(&i); (i, r) }).collect()
}

/// Pinched cylinder with rigid diaphragms (MacNeal–Harder), one eighth: R = 300, L = 600, t = 3,
/// E = 3e6, ν = 0.3, P = 1. Reference radial displacement under the load 1.8248e-5.
fn pinched_cylinder(fam: Fam, n: usize) -> Model {
    let (r, half_l) = (300.0, 300.0);
    let map = move |u: f64, v: f64| {
        let th = v * PI / 2.0;
        ([u * half_l, r * th.cos(), r * th.sin()], [0.0, th.cos(), th.sin()])
    };
    let bc = |i: usize, j: usize, mx: usize, my: usize| -> Option<[bool; 6]> {
        let mut f = [false; 6];
        if i == 0 { f[0] = true; f[4] = true; f[5] = true; }
        if i == mx { f[1] = true; f[2] = true; }
        if j == 0 { f[2] = true; f[3] = true; f[4] = true; }
        if j == my { f[1] = true; f[3] = true; f[5] = true; }
        f.iter().any(|&b| b).then_some(f)
    };
    let mut m = surface(fam, n, n, 3.0, 3000.0, 0.3, &map, &bc, Load::None);
    let (a, b) = m.grid[0][0];
    for id in if a == b { vec![a] } else { vec![a, b] } {
        m.input.loads.push(nodal(id, [0.0, -0.25 / if a == b { 1.0 } else { 2.0 }, 0.0]));
    }
    m
}

/// Hemispherical shell with an 18° hole (MacNeal–Harder), one quarter: R = 10, t = 0.04,
/// E = 6.825e7, ν = 0.3, ±2 radial point loads at the equator. Reference 0.093 (0.094 in
/// MacNeal–Harder; 0.0924 from converged shell analyses).
fn hemisphere(fam: Fam, n: usize) -> Model {
    let r = 10.0;
    let map = move |u: f64, v: f64| {
        let (phi, th) = (u * 72.0_f64.to_radians(), v * PI / 2.0);
        let nrm = [phi.cos() * th.cos(), phi.cos() * th.sin(), phi.sin()];
        ([r * nrm[0], r * nrm[1], r * nrm[2]], nrm)
    };
    let bc = |i: usize, j: usize, mx: usize, my: usize| -> Option<[bool; 6]> {
        let mut f = [false; 6];
        if j == 0 { f[1] = true; f[3] = true; f[5] = true; }
        if j == my { f[0] = true; f[4] = true; f[5] = true; }
        if i == mx && j == 0 { f[2] = true; }
        f.iter().any(|&b| b).then_some(f)
    };
    let mut m = surface(fam, n, n, 0.04, 68250.0, 0.3, &map, &bc, Load::None);
    // Each load lies on a symmetry plane: the quarter carries half of it.
    m.input.loads.push(nodal(m.grid[0][0].0, [1.0, 0.0, 0.0]));
    m.input.loads.push(nodal(m.grid[0][n].0, [0.0, -1.0, 0.0]));
    m
}

/// Morley's 30° skew plate, simply supported (w = 0), uniform load. Kirchhoff reference centre
/// deflection w_c = 4.08e-4 q L⁴ / D (Morley 1963).
fn morley(fam: Fam, n: usize) -> (Model, f64) {
    let (l, t, e_mpa, nu) = (100.0, 0.1, 200_000.0, 0.3);
    let (c, s) = (30.0_f64.to_radians().cos(), 30.0_f64.to_radians().sin());
    let map = move |u: f64, v: f64| ([u * l + v * l * c, v * l * s, 0.0], [0.0, 0.0, 1.0]);
    let bc = |i: usize, j: usize, mx: usize, my: usize| -> Option<[bool; 6]> {
        let edge = i == 0 || j == 0 || i == mx || j == my;
        edge.then(|| {
            let pin = (i == 0 && j == 0, i == mx && j == 0);
            [pin.0, pin.0 || pin.1, true, false, false, false]
        })
    };
    let d = e_mpa * 1000.0 * t * t * t / (12.0 * (1.0 - nu * nu));
    let m = surface(fam, n, n, t, e_mpa, nu, &map, &bc, Load::Pressure(-1.0));
    (m, 4.08e-4 * l.powi(4) / d)
}

// ==================== Effectivity ====================

/// Effectivity on the Navier plate against the exact Kirchhoff moments. The Reissner–Mindlin
/// elements (MITC4, MITC9, curved shell) converge to the Mindlin solution, whose soft simple
/// support has a twisting-moment boundary layer of width ~t the Kirchhoff moments lack: once the
/// discretization error falls to that model difference (MITC9 on fine meshes) θ drops, rightly
/// (the estimator measures the mesh, not the theory). The solid-shell (SHB8, ANS + EAS since
/// #401) converges to Kirchhoff here too (w_c/ref 0.972, 0.995, 1.000) and its estimate
/// over-states the error like DKT's (θ 1.34, 1.23, 1.12).
#[test]
fn zz_effectivity_navier_plate() {
    let d = plate_rigidity();
    let (w_exact, wc_exact) = navier(d);
    let norm = w_exact.sqrt();
    let mut table = Vec::new();
    for fam in [Fam::Mitc4, Fam::Dkt, Fam::Mitc9, Fam::Curved, Fam::Solid] {
        let mut prev_eta = f64::INFINITY;
        for n in [4, 8, 16] {
            let m = square_plate(fam, n, false);
            let r = solve(&m.input);
            let est = estimate(&m.input, &r);
            assert!(!est.certified);
            let true_err = navier_true_error(&m.input, &r, 0.01, 0.3);
            let theta = est.error_norm / true_err;
            let wc = mid_disp(&r, m.grid[n / 2][n / 2])[2].abs();
            println!("{fam:?} n={n:2}: w_c/ref={:.4} ‖e‖/‖u‖={:.4} η/‖u‖={:.4} θ={theta:.3}", wc / wc_exact, true_err / norm, est.error_norm / norm);
            if fam == Fam::Solid && n == 16 {
                assert!((wc / wc_exact - 1.0).abs() < 0.01, "solid-shell w_c/ref {:.4}", wc / wc_exact);
            }
            table.push((fam, n, theta));
            assert!(est.error_norm < prev_eta, "{fam:?}: the estimate falls under refinement");
            prev_eta = est.error_norm;
        }
    }
    for (fam, n, theta) in table {
        let band = match (fam, n) {
            (Fam::Mitc4 | Fam::Curved, 8 | 16) => Some((0.9, 1.15)),
            (Fam::Mitc4 | Fam::Curved, _) => Some((0.9, 1.25)),
            (Fam::Dkt, 16) => Some((0.9, 1.2)),
            (Fam::Dkt, 8) => Some((0.9, 1.35)),
            (Fam::Mitc9, 4) => Some((0.85, 1.15)),
            (Fam::Solid, 16) => Some((0.9, 1.2)),
            (Fam::Solid, 8) => Some((0.9, 1.35)),
            (Fam::Solid, 4) => Some((0.9, 1.45)),
            _ => None,
        };
        if let Some((lo, hi)) = band {
            assert!(theta > lo && theta < hi, "{fam:?} n={n}: effectivity {theta:.3} outside [{lo}, {hi}]");
        }
    }
}

/// A uniform membrane stretch on a distorted mesh is reproduced exactly by every element and by
/// the recovery: the estimate is zero.
#[test]
fn zz_estimate_vanishes_for_uniform_stress() {
    for fam in [Fam::Mitc4, Fam::Dkt, Fam::Mitc9] {
        let map = |u: f64, v: f64| {
            // A smooth, non-affine distortion of the unit square.
            let (x, y) = (u + 0.08 * (PI * u).sin() * (PI * v).sin(), v + 0.05 * (2.0 * PI * u).sin() * v);
            ([x, y, 0.0], [0.0, 0.0, 1.0])
        };
        let bc = |i: usize, j: usize, _mx: usize, _my: usize| -> Option<[bool; 6]> {
            Some([true, i == 0 && j == 0, true, true, true, true])
        };
        let mut m = surface(fam, 4, 4, 0.1, 200_000.0, 0.3, &map, &bc, Load::None);
        // Prescribed stretch ux = 1e-3·x at every node, uy free: a uniform stress field.
        for s in m.input.supports.values_mut() {
            let n = &m.input.nodes[&s.node_id.to_string()];
            s.rx = true;
            s.dx = Some(1e-3 * n.x);
        }
        let r = solve(&m.input);
        let est = estimate(&m.input, &r);
        assert!(est.solution_norm > 0.0);
        assert!(est.relative_error.unwrap() < 1e-6, "{fam:?}: uniform stress, estimate {:?}", est.relative_error);
    }
}

// ==================== Convergence: classic benchmarks ====================

fn richardson_of(m: &SolverInput3D, levels: usize, read: &dyn Fn(&AnalysisResults3D) -> f64) -> (Vec<f64>, f64, Option<f64>) {
    let v: Vec<f64> = sequence(m, levels).iter().map(|(_, r)| read(r)).collect();
    let (ext, p) = extrapolate(&v[v.len() - 3..]);
    (v, ext, p)
}

/// Scordelis–Lo from a 4 × 4 mesh refined three times (smooth geometry): the extrapolated
/// midspan free-edge deflection against 0.3024 (MITC9 is not converging from this mesh, and the
/// check must say so), and the effectivity of the curved shell, whose
/// refinement keeps the energy identity (MITC4 facets change the geometry from mesh to mesh, so
/// ‖u‖²_E − ‖u_h‖²_E is not the error there).
#[test]
fn convergence_scordelis_lo() {
    for (fam, tol) in [(Fam::Mitc4, 0.01), (Fam::Curved, 0.01), (Fam::Mitc9, 0.015)] {
        let base = scordelis(fam, 4);
        let target = base.grid[0][4].0;
        let seq = sequence(&base.input, 3);
        let uz: Vec<f64> = seq.iter().map(|(_, r)| disp(r, target)[2].abs()).collect();
        let (p, ext, _, status) = richardson(&uz[1..]);
        println!("{fam:?} Scordelis–Lo uz: {uz:?} → {ext:?} (p={p:?}, {status}), ref 0.3024");
        if fam == Fam::Mitc9 {
            // Drifts up ≈ 0.5 % per refinement from this mesh: the check says so instead of
            // extrapolating. The finest mesh is still close.
            assert_eq!(status, "notConverging");
            assert!((uz[3] / mh::reference("scordelis") - 1.0).abs() < tol, "MITC9: finest {:.5} vs 0.3024", uz[3]);
        } else {
            assert_eq!(status, "converging", "{fam:?}");
            let ext = ext.unwrap();
            assert!((ext / mh::reference("scordelis") - 1.0).abs() < tol, "{fam:?}: extrapolated {ext:.5} vs 0.3024");
        }
        if fam == Fam::Curved {
            let w: Vec<f64> = seq.iter().map(|(m, r)| energy_norm_sq(m, r)).collect();
            let (w_ext, _) = extrapolate(&w[1..]);
            for (k, (m, r)) in seq.iter().enumerate() {
                let theta = estimate(m, r).error_norm / (w_ext - w[k]).sqrt();
                println!("   level {k}: θ = {theta:.3}");
                assert!(theta > 0.8 && theta < 1.15, "curved shell Scordelis–Lo level {k}: θ = {theta:.3}");
            }
        }
        if fam == Fam::Mitc9 {
            // MITC9 elements are flat facets (with rigid links to the curved nodes, SH-7), so,
            // as for MITC4, refinement changes the geometry and ‖u‖²_E − ‖u_h‖²_E is not the
            // error: the energies are not monotone (2435.5, 2421.4, 2431.7, 2442.5 before the
            // SH-7 fix, 2439.9, 2422.8, 2432.4, 2442.7 after), and the effectivity 0.99 that
            // this check used to find against w₃ − w₀ was a coincidence (1.57 after the fix,
            // with nearly the same displacements and estimates). Only the estimate's fall under
            // the first refinements is checked; the MITC9 effectivity is checked on the plate.
            let eta: Vec<f64> = seq.iter().map(|(m, r)| estimate(m, r).error_norm).collect();
            println!("   MITC9 estimates: {eta:?}");
            assert!(eta[0] > eta[1] && eta[1] > eta[2], "MITC9 Scordelis–Lo estimates {eta:?}");
        }
    }
}

#[test]
fn convergence_pinched_cylinder_and_hemisphere() {
    for fam in [Fam::Mitc4, Fam::Curved] {
        let m = pinched_cylinder(fam, 8);
        let id = m.grid[0][0].0;
        let (v, ext, p) = richardson_of(&m.input, 3, &|r| disp(r, id)[1].abs());
        println!("{fam:?} pinched cylinder: {v:?} → {ext:.5e} (p={p:?}), ref 1.8248e-5");
        assert!((ext / mh::reference("pinchedCylinder") - 1.0).abs() < 0.03, "{fam:?} pinched cylinder {ext:.4e}");

        let m = hemisphere(fam, 8);
        if fam == Fam::Mitc4 {
            crate::common::assert_containment(linear::solve_3d(&m.input), "SH-MITC4-DISTORTION");
            continue;
        }
        let id = m.grid[0][0].0;
        let (v, ext, p) = richardson_of(&m.input, 3, &|r| disp(r, id)[0].abs());
        println!("{fam:?} hemisphere: {v:?} → {ext:.5} (p={p:?}), ref 0.093 (0.0924–0.094)");
        assert!(ext > mh::reference("hemisphereConverged") * 0.98 && ext < mh::reference("hemisphere") * 1.02, "{fam:?} hemisphere {ext:.5}");
    }
}

/// MITC9 on the curved benchmarks, 16 × 16 elements (33 × 33 nodes) on the quarter or eighth.
/// Before SH-7 (#411) the curved elements were strained by rigid rotation and the hemisphere,
/// whose elements rotate the most, came out 6.5 % stiff (0.9347 of 0.093; 0.50 at 8 × 8); with
/// the rigid links it is 0.9755 (0.68 at 8 × 8). Scordelis–Lo and the pinched cylinder moved by
/// less than 0.1 %.
#[test]
fn mitc9_curved_benchmarks_at_16x16() {
    let n = 16;
    let m = scordelis(Fam::Mitc9, n);
    let sl = disp(&solve(&m.input), m.grid[0][n].0)[2].abs() / mh::reference("scordelis");
    let m = pinched_cylinder(Fam::Mitc9, n);
    let pc = disp(&solve(&m.input), m.grid[0][0].0)[1].abs() / mh::reference("pinchedCylinder");
    let m = hemisphere(Fam::Mitc9, n);
    let hs = disp(&solve(&m.input), m.grid[0][0].0)[0].abs() / 0.093;
    println!("MITC9 16×16: Scordelis–Lo {sl:.4}, pinched cylinder {pc:.4}, hemisphere {hs:.4}");
    assert!((sl - 1.0).abs() < 0.01, "Scordelis–Lo {sl:.4}");
    assert!((pc - 1.0).abs() < 0.015, "pinched cylinder {pc:.4}");
    assert!((hs - 1.0).abs() < 0.03, "hemisphere {hs:.4}");
}

/// Plates: Morley's skew plate (DKT; the Mindlin elements are not in the asymptotic range on
/// these meshes, which the check reports instead of extrapolating) and the simply supported and
/// clamped squares against Timoshenko's coefficients.
#[test]
fn convergence_plates() {
    let (m, wref) = morley(Fam::Dkt, 4);
    let id = m.grid[2][2].0;
    let (v, ext, p) = richardson_of(&m.input, 3, &|r| disp(r, id)[2].abs());
    println!("DKT Morley: {:?} → {:.4} (p={p:?})", v.iter().map(|x| x / wref).collect::<Vec<_>>(), ext / wref);
    assert!((ext / wref - 1.0).abs() < 0.02);

    let (m, wref) = morley(Fam::Mitc4, 4);
    let id = m.grid[2][2].0;
    let v: Vec<f64> = sequence(&m.input, 3).iter().map(|(_, r)| disp(r, id)[2].abs() / wref).collect();
    let (_, _, _, status) = richardson(&v[1..]);
    println!("MITC4 Morley: {v:?} ({status})");
    assert_eq!(status, "oscillating", "MITC4 on Morley is not asymptotic at these meshes and must say so");

    for fam in [Fam::Mitc4, Fam::Dkt, Fam::Mitc9] {
        for clamped in [false, true] {
            let m = square_plate(fam, 4, clamped);
            let id = m.grid[2][2].0;
            // Timoshenko & Woinowsky-Krieger: 0.00406 (simply supported), 0.00126 (clamped).
            let wref = if clamped { 0.00126 } else { 0.00406 } / plate_rigidity();
            if fam == Fam::Mitc9 && !clamped {
                // Not in the asymptotic range on these meshes (it dips, then rises towards the
                // Mindlin solution): reported, not extrapolated. The finest mesh is close.
                let v: Vec<f64> = sequence(&m.input, 3).iter().map(|(_, r)| disp(r, id)[2].abs() / wref).collect();
                let status = richardson(&v[1..]).3;
                println!("{fam:?} square plate clamped={clamped}: {v:?} ({status})");
                assert_eq!(status, "notConverging");
                assert!((v[3] - 1.0).abs() < 0.012, "{fam:?} clamped={clamped}: finest {:.4}", v[3]);
                continue;
            }
            let (v, ext, p) = richardson_of(&m.input, 3, &|r| disp(r, id)[2].abs() / wref);
            println!("{fam:?} square plate clamped={clamped}: {v:?} → {ext:.4} (p={p:?})");
            assert!((ext - 1.0).abs() < 0.012, "{fam:?} clamped={clamped}: {ext:.4}");
        }
    }
}

// ==================== Refinement ====================

fn total_reaction(r: &AnalysisResults3D) -> [f64; 3] {
    r.reactions.iter().fold([0.0; 3], |a, x| [a[0] + x.fx, a[1] + x.fy, a[2] + x.fz])
}

/// A plate on two edge beams: refinement splits the beams at the new edge nodes (so they stay
/// connected), carries the member and pressure loads over with the same totals, and gives the
/// new edge nodes the supports of their neighbours, but not the diagonal of a corner triangle.
#[test]
fn refinement_keeps_loads_supports_and_members() {
    let mut m = square_plate(Fam::Dkt, 4, false);
    m.input.sections.insert("1".into(), SolverSection3D {
        id: 1, name: None, a: 0.01, iy: 1e-5, iz: 1e-5, j: 2e-5, cw: None, as_y: None, as_z: None,
        shear_center_y: None, shear_center_z: None,
    });
    let mut eid = 1000;
    for j in 0..4 {
        let (a, b) = (m.grid[2][j].0, m.grid[2][j + 1].0);
        m.input.elements.insert(eid.to_string(), SolverElement3D {
            id: eid, elem_type: "frame".into(), node_i: a, node_j: b, material_id: 1, section_id: 1,
            release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
            release_t_start: false, release_t_end: false, local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
        m.input.loads.push(SolverLoad3D::Distributed(SolverDistributedLoad3D {
            element_id: eid, q_xi: 0.0, q_xj: 0.0, q_yi: 0.0, q_yj: 0.0, q_zi: -2.0, q_zj: -2.0, a: None, b: None,
        }));
        eid += 1;
    }
    let r0 = solve(&m.input);
    let refined = refine_uniform(&m.input, GeometryMode::Smooth).unwrap();
    let rf = &refined.input;
    assert_eq!(rf.plates.len(), 4 * m.input.plates.len());
    assert_eq!(rf.elements.len(), 8, "each beam along a split edge is split in two");
    // Every beam end is a node of the refined shell mesh.
    let shell_nodes: std::collections::HashSet<usize> = rf.plates.values().flat_map(|p| p.nodes).collect();
    assert!(rf.elements.values().all(|e| shell_nodes.contains(&e.node_i) && shell_nodes.contains(&e.node_j)));
    let r1 = solve(rf);
    let (t0, t1) = (total_reaction(&r0), total_reaction(&r1));
    assert!((t0[2] - t1[2]).abs() < 1e-9 * t0[2].abs(), "total load preserved: {t0:?} vs {t1:?}");
    // Supported nodes: the boundary of the 8 × 8 mesh, no more.
    let supported: std::collections::HashSet<usize> = rf.supports.values().map(|s| s.node_id).collect();
    for n in rf.nodes.values() {
        let on_edge = n.x.abs() < 1e-9 || n.y.abs() < 1e-9 || (n.x - 1.0).abs() < 1e-9 || (n.y - 1.0).abs() < 1e-9;
        assert_eq!(supported.contains(&n.id), on_edge, "node {} at ({}, {})", n.id, n.x, n.y);
    }
}

#[test]
fn refinement_refuses_what_it_cannot_extend() {
    let mut m = square_plate(Fam::Mitc4, 2, false);
    m.input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint { master_node: m.grid[1][1].0, slave_node: m.grid[1][2].0, dofs: vec![0] }));
    let err = convergence_study_3d(&m.input, &ConvergenceOptions::default()).unwrap_err();
    assert_eq!(err, "constraints");
}

/// A frame-only model has nothing to estimate and says why: exact members.
#[test]
fn frames_only_estimate_says_exact() {
    let mut input = empty_input();
    input.materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    input.sections.insert("1".into(), SolverSection3D { id: 1, name: None, a: 0.01, iy: 1e-5, iz: 1e-5, j: 2e-5, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None });
    input.nodes.insert("1".into(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    input.nodes.insert("2".into(), SolverNode3D { id: 2, x: 4.0, y: 0.0, z: 0.0 });
    input.elements.insert("1".into(), SolverElement3D {
        id: 1, elem_type: "frame".into(), node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
        release_t_start: false, release_t_end: false, local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    });
    input.supports.insert("1".into(), support(1, [true; 6]));
    input.loads.push(nodal(2, [0.0, 0.0, -10.0]));
    let r = solve(&input);
    let e = estimate(&input, &r);
    assert_eq!(e.relative_error, None);
    assert!(e.notes.contains(&"framesExact".to_string()) && e.notes.contains(&"noShellElements".to_string()));
    let json = serde_json::to_value(&e).unwrap();
    assert_eq!(json["certified"], serde_json::json!(false));
}

/// Curved-shell self-weight takes its density in kg/m³ like every other shell (it used to weigh
/// 1000× too much).
#[test]
fn curved_shell_self_weight_matches_quads() {
    let w = |fam: Fam| {
        let map = |u: f64, v: f64| ([u, v, 0.0], [0.0, 0.0, 1.0]);
        let bc = |i: usize, j: usize, mx: usize, my: usize| (i == 0 || j == 0 || i == mx || j == my).then_some([true; 6]);
        let m = surface(fam, 2, 2, 0.2, 30_000.0, 0.2, &map, &bc, Load::Weight([0.0, 0.0, -9.81]));
        total_reaction(&solve(&m.input))[2]
    };
    let (q, c) = (w(Fam::Mitc4), w(Fam::Curved));
    // ρ = 1000/t kg/m³ with g = 9.81: 9.81 kN/m² over 1 m².
    assert!((q - 9.81).abs() < 1e-9 && (c - 9.81).abs() < 1e-9, "quad {q}, curved {c}");
}

/// One MITC4 element, or two DKT triangles, simply supported on all four edges: every element is
/// fully supported, yet the new edge midpoints are on the supported boundary and must stay
/// supported, while the new centre node is inside the plate and must stay free.
#[test]
fn refinement_keeps_line_supports_of_a_one_element_plate() {
    for fam in [Fam::Mitc4, Fam::Dkt] {
        let m = square_plate(fam, 1, false);
        let refined = refine_uniform(&m.input, GeometryMode::Faceted).unwrap();
        let rf = &refined.input;
        let supported: std::collections::HashSet<usize> = rf.supports.values().filter(|s| s.rz).map(|s| s.node_id).collect();
        for n in rf.nodes.values() {
            let on_edge = n.x.abs() < 1e-9 || n.y.abs() < 1e-9 || (n.x - 1.0).abs() < 1e-9 || (n.y - 1.0).abs() < 1e-9;
            assert_eq!(supported.contains(&n.id), on_edge, "{fam:?}: node at ({}, {})", n.x, n.y);
        }
        // Supports the model did not have are said to be inferred.
        assert!(refined.caveats.iter().any(|c| c == "supportsInferred"), "{fam:?}: {:?}", refined.caveats);
        // And the sequence converges to the simply supported plate, not a corner-supported one.
        let seq = sequence(&m.input, 3);
        let (fine_in, fine_r) = seq.last().unwrap();
        let centre = fine_in.nodes.values().find(|n| (n.x - 0.5).abs() < 1e-9 && (n.y - 0.5).abs() < 1e-9).unwrap().id;
        let ratio = disp(fine_r, centre)[2].abs() / (0.00406 / plate_rigidity());
        assert!((ratio - 1.0).abs() < 0.1, "{fam:?}: 8 × 8 from one element gives {ratio:.3} of the SS plate");
    }
}

/// Curved shells (and solid-shells) report only mid-surface stress at their centres: the
/// governing moment and surface stress come from their through-thickness points, and agree with
/// MITC4 on a flat plate in bending.
#[test]
fn governing_bending_of_curved_and_solid_shells() {
    let q = |fam: Fam| {
        let m = square_plate(fam, 8, true);
        let r = solve(&m.input);
        governing(&m.input, &r, usize::MAX)
    };
    let (g4, gc, gs) = (q(Fam::Mitc4), q(Fam::Curved), q(Fam::Solid));
    let key = |k: &str| (k.to_string(), 0usize);
    let m4 = g4[&key("maxMoment")];
    let s4 = g4[&key("maxStress")];
    println!("maxMoment MITC4 {m4:.4e} curved {:?} solid {:?}", gc.get(&key("maxMoment")), gs.get(&key("maxMoment")));
    println!("maxStress MITC4 {s4:.4e} curved {:?} solid {:?}", gc.get(&key("maxStress")), gs.get(&key("maxStress")));
    for (name, g) in [("curved", &gc), ("solid", &gs)] {
        let (m, s) = (g[&key("maxMoment")], g[&key("maxStress")]);
        // Integration points sit closer to the clamped edge than centres do: same order, not equal.
        assert!(m > 0.6 * m4 && m < 1.6 * m4, "{name}: max moment {m:.4e} vs MITC4 {m4:.4e}");
        assert!(s > 0.6 * s4 && s < 1.6 * s4, "{name}: max surface stress {s:.4e} vs MITC4 {s4:.4e}");
    }
}

// ==================== Degenerate cases: never "no error" ====================

/// One simply supported MITC4 element under pressure: the load goes straight into the corner
/// supports, the element carries no strain, and the estimate is 0/0. It must say it cannot
/// estimate (and warn), never 0 %.
#[test]
fn loaded_mesh_without_strain_energy_is_unestimable() {
    let m = square_plate(Fam::Mitc4, 1, false);
    let r = solve(&m.input);
    let e = estimate(&m.input, &r);
    assert_eq!(e.relative_error, None, "a 0/0 must not be reported as an error of {:?}", e.relative_error);
    assert_eq!(e.unestimable_reason.as_deref(), Some("noStrainEnergy"));
    assert!(e.exceeds_threshold, "a mesh too coarse to estimate is flagged");

    // The same mesh with no load at all has nothing to estimate, and no warning.
    let mut unloaded = m.input.clone();
    unloaded.loads.clear();
    let r = solve(&unloaded);
    let e = estimate(&unloaded, &r);
    assert_eq!(e.relative_error, None);
    assert_eq!(e.unestimable_reason.as_deref(), Some("unloaded"));
    assert!(!e.exceeds_threshold);
}

/// The convergence study of that one-element plate keeps the shell moment and stress although
/// they are zero on the model as drawn, and flags them.
#[test]
fn convergence_keeps_zero_coarse_shell_quantities() {
    let m = square_plate(Fam::Mitc4, 1, false);
    let s = convergence_study_3d(&m.input, &ConvergenceOptions::default()).unwrap();
    for name in ["maxMoment", "maxStress"] {
        let q = s.quantities.iter().find(|q| q.quantity == name).unwrap_or_else(|| panic!("{name} dropped from the study"));
        assert_eq!(q.values[0], 0.0);
        assert!(q.values[2] > 0.0, "{name}: {:?}", q.values);
    }
    assert!(s.exceeds_threshold);
}

fn cantilever_with_section(cw: Option<f64>) -> SolverInput3D {
    let mut input = empty_input();
    input.materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    input.sections.insert("1".into(), SolverSection3D { id: 1, name: None, a: 0.01, iy: 1e-5, iz: 1e-5, j: 2e-7, cw, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None });
    input.nodes.insert("1".into(), SolverNode3D { id: 1, x: 0.0, y: 0.0, z: 0.0 });
    input.nodes.insert("2".into(), SolverNode3D { id: 2, x: 4.0, y: 0.0, z: 0.0 });
    input.elements.insert("1".into(), SolverElement3D {
        id: 1, elem_type: "frame".into(), node_i: 1, node_j: 2, material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
        release_t_start: false, release_t_end: false, local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    });
    let mut s = support(1, [true; 6]);
    s.rw = Some(true);
    input.supports.insert("1".into(), s);
    input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 0.0, fy: 0.0, fz: 0.0, mx: 1.0, my: 0.0, mz: 0.0, bw: None }));
    input
}

/// A member with warping torsion uses a cubic Hermite warping field, not an exact stiffness:
/// the estimate must not call it exact. Its tip twist does change when the member is split.
#[test]
fn warping_members_are_not_claimed_exact() {
    let plain = cantilever_with_section(None);
    let e = estimate(&plain, &solve(&plain));
    assert!(e.notes.contains(&"framesExact".to_string()));
    assert!(e.inexact_members.is_empty());

    let warping = cantilever_with_section(Some(1e-6));
    let r = solve(&warping);
    let e = estimate(&warping, &r);
    assert!(!e.notes.contains(&"framesExact".to_string()), "notes {:?}", e.notes);
    assert!(e.notes.contains(&"warpingMembersNotEstimated".to_string()));
    assert_eq!(e.inexact_members, vec![1]);

    // The reason: the same member in two pieces twists differently.
    let mut split = warping.clone();
    split.nodes.insert("3".into(), SolverNode3D { id: 3, x: 2.0, y: 0.0, z: 0.0 });
    let mut a = split.elements["1"].clone();
    a.node_j = 3;
    let mut b = split.elements["1"].clone();
    b.id = 2;
    b.node_i = 3;
    split.elements.insert("1".into(), a);
    split.elements.insert("2".into(), b);
    let (t1, t2) = (
        r.displacements.iter().find(|d| d.node_id == 2).unwrap().rx,
        solve(&split).displacements.iter().find(|d| d.node_id == 2).unwrap().rx,
    );
    println!("warping cantilever tip twist: 1 member {t1:.6e}, 2 members {t2:.6e}");
    assert!((t1 - t2).abs() > 1e-6 * t2.abs(), "warping members are mesh dependent");
}

/// Curved beams are solved as straight segments: no exact claim either.
#[test]
fn curved_beams_are_not_claimed_exact() {
    let mut input = cantilever_with_section(None);
    input.nodes.insert("3".into(), SolverNode3D { id: 3, x: 6.0, y: 2.0, z: 0.0 });
    input.nodes.insert("4".into(), SolverNode3D { id: 4, x: 8.0, y: 0.0, z: 0.0 });
    input.curved_beams.push(CurvedBeamInput {
        node_start: 2, node_mid: 3, node_end: 4, material_id: 1, section_id: 1, num_segments: 8,
        hinge_start: false, hinge_end: false,
    });
    let e = estimate(&input, &solve(&input));
    assert!(!e.notes.contains(&"framesExact".to_string()), "notes {:?}", e.notes);
    assert!(e.notes.contains(&"curvedBeamsSegmented".to_string()));
}

/// One clamped MITC4 element with a tip load carries strain, but every recovery patch is the
/// element itself: the recovered field is its own and the estimate would be ~0 by construction.
/// Too coarse to estimate, and flagged.
#[test]
fn single_element_mesh_is_too_coarse_to_estimate() {
    let map = |u: f64, v: f64| ([2.0 * u, 0.5 * v, 0.0], [0.0, 0.0, 1.0]);
    let bc = |i: usize, _j: usize, _mx: usize, _my: usize| (i == 0).then_some([true; 6]);
    let mut m = surface(Fam::Mitc4, 1, 1, 0.02, 200_000.0, 0.3, &map, &bc, Load::None);
    for row in [m.grid[1][0].0, m.grid[1][1].0] {
        m.input.loads.push(nodal(row, [0.0, 0.0, -1.0]));
    }
    let r = solve(&m.input);
    let e = estimate(&m.input, &r);
    assert!(e.elements.iter().any(|x| x.energy_norm > 0.0), "the element is strained");
    assert_eq!(e.relative_error, None, "estimate {:?} from a patch that is the element itself", e.relative_error);
    assert_eq!(e.unestimable_reason.as_deref(), Some("tooCoarse"));
    assert!(e.exceeds_threshold);
}

/// A non-monotone sequence is inconclusive: [1, 1.01, 0.5] moved 50 % in its last step, and must
/// neither report "< 1 %" nor pass the threshold.
#[test]
fn oscillating_sequences_are_inconclusive_and_flagged() {
    let q = quantity_convergence("maxDisplacement", None, vec![1.0, 1.01, 0.5]);
    assert_eq!(q.status, "oscillating");
    assert!(is_inconclusive(&q.status));
    assert_eq!(q.estimated_error, None);
    assert!(q.relative_change > 0.9, "the last step's change counts: {}", q.relative_change);
    // Growing differences: not converging, flagged too.
    let q = quantity_convergence("maxStress", None, vec![1.0, 1.1, 1.3]);
    assert_eq!(q.status, "notConverging");
    assert!(is_inconclusive(&q.status));
    // Implausible order: the error is never smaller than the changes seen.
    let q = quantity_convergence("maxMoment", None, vec![1.0, 1.2, 1.2001]);
    assert_eq!(q.status, "irregularOrder");
    assert!(q.estimated_error.unwrap() >= q.relative_change);
    // A converging one is not.
    let q = quantity_convergence("maxDisplacement", None, vec![0.9, 0.975, 0.99375]);
    assert_eq!(q.status, "converging");
    assert!(!is_inconclusive(&q.status));
}

/// Two triangles meeting at a sharp fold share a node but not a recovery patch: each is alone,
/// so the estimate is "too coarse", not the ≈ 0 % two single-element patches would give.
#[test]
fn elements_separated_by_a_fold_are_isolated() {
    let mut input = empty_input();
    input.materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    for (id, p) in [(1, [0.0, 0.0, 0.0]), (2, [1.0, 0.0, 0.0]), (3, [0.0, 1.0, 0.0]), (4, [0.0, 0.0, 1.0])] {
        input.nodes.insert(id.to_string(), SolverNode3D { id, x: p[0], y: p[1], z: p[2] });
    }
    // Triangle in the xy-plane and one in the xz-plane, folded 90° along the edge 1–2.
    input.plates.insert("1".into(), SolverPlateElement { id: 1, nodes: [1, 2, 3], material_id: 1, thickness: 0.05 });
    input.plates.insert("2".into(), SolverPlateElement { id: 2, nodes: [1, 4, 2], material_id: 1, thickness: 0.05 });
    input.supports.insert("1".into(), support(1, [true; 6]));
    input.supports.insert("2".into(), support(2, [true; 6]));
    input.loads.push(nodal(3, [0.0, 0.0, -1.0]));
    input.loads.push(nodal(4, [0.0, 1.0, 0.0]));
    let r = solve(&input);
    let e = estimate(&input, &r);
    assert!(e.elements.iter().all(|x| x.energy_norm > 0.0), "both triangles are strained");
    assert_eq!(e.relative_error, None, "estimate {:?} from single-element patches", e.relative_error);
    assert_eq!(e.unestimable_reason.as_deref(), Some("tooCoarse"));
    assert_eq!(e.isolated_elements, vec![1, 2]);
    assert!(e.elements.iter().all(|x| x.local_percent.is_none()));
    assert!(e.exceeds_threshold);
}

/// A plate meshed 4 × 4 with one lone element hanging off a fold: the plate is estimated, the
/// lone element is listed as not estimated (no 0 % for it), and since it carries strain the
/// result is flagged.
#[test]
fn a_lone_element_is_listed_not_estimated() {
    let mut m = square_plate(Fam::Dkt, 4, true);
    let (a, b) = (m.grid[2][2].0, m.grid[3][2].0);
    m.input.nodes.insert("900".into(), SolverNode3D { id: 900, x: 0.5, y: 0.5, z: 0.3 });
    m.input.plates.insert("900".into(), SolverPlateElement { id: 900, nodes: [a, b, 900], material_id: 1, thickness: 0.01 });
    m.input.loads.push(nodal(900, [0.0, 0.0, -1.0]));
    let r = solve(&m.input);
    let e = estimate(&m.input, &r);
    assert!(e.relative_error.is_some());
    assert_eq!(e.isolated_elements, vec![900]);
    assert!(e.notes.contains(&"isolatedElementsNotEstimated".to_string()));
    assert!(e.elements.iter().find(|x| x.element_id == 900 && x.kind == "plate").unwrap().local_percent.is_none());
    assert!(e.exceeds_threshold, "a strained element that is not estimated is flagged");
}

fn beam(id: usize, i: usize, j: usize) -> SolverElement3D {
    SolverElement3D {
        id, elem_type: "frame".into(), node_i: i, node_j: j, material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
        release_t_start: false, release_t_end: false, local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    }
}

fn udl(element_id: usize, q: f64) -> SolverLoad3D {
    SolverLoad3D::Distributed(SolverDistributedLoad3D {
        element_id, q_xi: 0.0, q_xj: 0.0, q_yi: q, q_yj: q, q_zi: 0.0, q_zj: 0.0, a: None, b: None,
    })
}

/// A simply supported member under a uniform load: one member or two, the largest moment along
/// it is the same, qL²/8 (the ends of the one member are zero, its middle is not).
#[test]
fn member_moment_max_reads_the_whole_diagram() {
    let mut input = empty_input();
    input.materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    input.sections.insert("1".into(), SolverSection3D { id: 1, name: None, a: 0.01, iy: 1e-4, iz: 1e-4, j: 2e-4, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None });
    for (id, x) in [(1, 0.0), (2, 4.0)] {
        input.nodes.insert(id.to_string(), SolverNode3D { id, x, y: 0.0, z: 0.0 });
    }
    input.supports.insert("1".into(), support(1, [true, true, true, true, false, false]));
    input.supports.insert("2".into(), support(2, [false, true, true, false, false, false]));
    input.elements.insert("1".into(), beam(1, 1, 2));
    input.loads.push(udl(1, -10.0));
    let one = solve(&input).element_forces.iter().map(member_moment_max).fold(0.0, f64::max);
    let mut split = input.clone();
    split.nodes.insert("3".into(), SolverNode3D { id: 3, x: 2.0, y: 0.0, z: 0.0 });
    split.elements.clear();
    split.elements.insert("1".into(), beam(1, 1, 3));
    split.elements.insert("2".into(), beam(2, 3, 2));
    split.loads = vec![udl(1, -10.0), udl(2, -10.0)];
    let two = solve(&split).element_forces.iter().map(member_moment_max).fold(0.0, f64::max);
    println!("max moment: one member {one}, two members {two}, qL²/8 = {}", 10.0 * 16.0 / 8.0);
    assert!((one - 20.0).abs() < 1e-9 * 20.0 && (two - 20.0).abs() < 1e-9 * 20.0);
}

/// A beam simply supported off the shell, with its middle span along an edge of a (very soft)
/// shell: refinement splits that span, the beam is exact, and the study must not report a frame
/// discretization error (end moments alone jumped from the span's ends to its middle).
#[test]
fn split_exact_member_raises_no_frame_warning() {
    let mut input = empty_input();
    input.materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    input.materials.insert("2".into(), SolverMaterial { id: 2, e: 0.2, nu: 0.3 });
    input.sections.insert("1".into(), SolverSection3D { id: 1, name: None, a: 0.01, iy: 1e-4, iz: 1e-4, j: 2e-4, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None });
    for (id, x, y) in [(1, -1.0, 0.0), (2, 0.0, 0.0), (3, 1.0, 0.0), (4, 2.0, 0.0), (5, 1.0, 1.0), (6, 0.0, 1.0)] {
        input.nodes.insert(id.to_string(), SolverNode3D { id, x, y, z: 0.0 });
    }
    input.supports.insert("1".into(), support(1, [true, true, true, true, false, false]));
    input.supports.insert("2".into(), support(4, [false, true, true, false, false, false]));
    input.supports.insert("3".into(), support(5, [true; 6]));
    input.supports.insert("4".into(), support(6, [true; 6]));
    for (id, i, j) in [(1, 1, 2), (2, 2, 3), (3, 3, 4)] {
        input.elements.insert(id.to_string(), beam(id, i, j));
        input.loads.push(udl(id, -10.0));
    }
    input.quads.insert("10".into(), SolverQuadElement { id: 10, nodes: [2, 3, 5, 6], material_id: 2, thickness: 0.1 });
    let s = convergence_study_3d(&input, &ConvergenceOptions::default()).unwrap();
    let q = s.quantities.iter().find(|q| q.quantity == "maxFrameMoment").unwrap();
    println!("maxFrameMoment {:?} {} {:?}", q.values, q.status, q.estimated_error);
    assert!(!is_inconclusive(&q.status), "{}", q.status);
    assert!(q.relative_change < 1e-3, "an exact member moved {}", q.relative_change);
    assert!(q.estimated_error.unwrap_or(q.relative_change) < 1e-3);
}

// ==================== Refinement: supports and malformed models ====================

/// A flat slab on a column grid, one MITC4 per bay, pinned columns at every node. Interior edges
/// run between columns, not along a supported line: refinement keeps the interior columns as
/// points, so the refined slab deflects between them and the study reads a real change, not a
/// slab pinned everywhere (`zero`). The perimeter edges are exterior and are taken as line
/// supports (that rule cannot tell columns from a coarse supported edge), and the study says so.
#[test]
fn refinement_keeps_interior_column_supports_as_points() {
    let map = |u: f64, v: f64| ([3.0 * u, 3.0 * v, 0.0], [0.0, 0.0, 1.0]);
    let bc = |_i: usize, _j: usize, _mx: usize, _my: usize| Some([true, true, true, false, false, false]);
    let m = surface(Fam::Mitc4, 3, 3, 0.2, 30_000.0, 0.2, &map, &bc, Load::Pressure(-10.0));
    let refined = refine_uniform(&m.input, GeometryMode::Faceted).unwrap();
    let rf = &refined.input;
    let supported: std::collections::HashSet<usize> = rf.supports.values().map(|s| s.node_id).collect();
    for n in rf.nodes.values() {
        let column = (n.x - n.x.round()).abs() < 1e-9 && (n.y - n.y.round()).abs() < 1e-9;
        let perimeter = n.x.abs() < 1e-9 || n.y.abs() < 1e-9 || (n.x - 3.0).abs() < 1e-9 || (n.y - 3.0).abs() < 1e-9;
        assert_eq!(supported.contains(&n.id), column || perimeter, "node at ({}, {})", n.x, n.y);
    }
    assert!(refined.caveats.iter().any(|c| c == "supportsInferred"), "{:?}", refined.caveats);
    let wmax = solve(rf).displacements.iter().map(|d| d.uz.abs()).fold(0.0, f64::max);
    assert!(wmax > 0.0, "the refined slab must deflect between its columns");

    let s = convergence_study_3d(&m.input, &ConvergenceOptions::default()).unwrap();
    let q = s.quantities.iter().find(|q| q.quantity == "maxDisplacement").unwrap();
    println!("column grid: maxDisplacement {:?} {}", q.values, q.status);
    assert_ne!(q.status, "zero");
    assert!(s.exceeds_threshold, "a slab drawn without any free node is not converged");
    // 12 perimeter edges, then 24: the new nodes the finest mesh supports.
    assert!(s.caveats.iter().any(|c| c == "supportsInferred"), "{:?}", s.caveats);
    assert_eq!(s.supports_inferred, 12 + 24);
}

/// Supports are inferred only where the model has an exterior edge between supported nodes: a
/// plate on its four corners gets none, and no caveat.
#[test]
fn no_supports_inferred_no_caveat() {
    let map = |u: f64, v: f64| ([u, v, 0.0], [0.0, 0.0, 1.0]);
    let bc = |i: usize, j: usize, mx: usize, my: usize| ((i == 0 || i == mx) && (j == 0 || j == my)).then_some([true; 6]);
    let m = surface(Fam::Mitc4, 2, 2, 0.1, 30_000.0, 0.2, &map, &bc, Load::Pressure(-1.0));
    let refined = refine_uniform(&m.input, GeometryMode::Faceted).unwrap();
    assert_eq!(refined.input.supports.len(), 4);
    assert!(!refined.caveats.iter().any(|c| c == "supportsInferred"));
}

/// An element naming a missing node is an error from the convergence study, never a panic (a
/// trap in WASM): refinement indexes the node coordinates before the solver's own validation.
#[test]
fn convergence_study_errs_on_a_missing_node() {
    for fam in [Fam::Mitc4, Fam::Dkt, Fam::Mitc9, Fam::Curved, Fam::Solid] {
        let mut m = square_plate(fam, 2, false);
        match fam {
            Fam::Mitc4 => m.input.quads.get_mut("1").unwrap().nodes[2] = 999,
            Fam::Dkt => m.input.plates.get_mut("1").unwrap().nodes[2] = 999,
            Fam::Mitc9 => m.input.quad9s.get_mut("1").unwrap().nodes[8] = 999,
            Fam::Curved => m.input.curved_shells.get_mut("1").unwrap().nodes[2] = 999,
            Fam::Solid => m.input.solid_shells.get_mut("1").unwrap().nodes[6] = 999,
        }
        let r = std::panic::catch_unwind(|| convergence_study_3d(&m.input, &ConvergenceOptions::default()));
        let err = r.unwrap_or_else(|_| panic!("{fam:?}: convergence study panicked on a missing node")).unwrap_err();
        assert!(err.contains("999"), "{fam:?}: {err}");
    }
}

/// A non-finite stress field is no estimate: never a NaN percentage (which compares false
/// against the threshold and would read as "small"), never a NaN element indicator.
#[test]
fn non_finite_estimate_is_unestimable() {
    let m = square_plate(Fam::Mitc4, 2, false);
    let mut r = solve(&m.input);
    let centre = m.grid[1][1].0;
    for d in r.displacements.iter_mut().filter(|d| d.node_id == centre) {
        d.rx = f64::NAN;
    }
    let e = estimate(&m.input, &r);
    assert_eq!(e.relative_error, None, "NaN reported as an estimate of {:?}", e.relative_error);
    assert_eq!(e.unestimable_reason.as_deref(), Some("nonFinite"));
    assert!(e.exceeds_threshold, "a non-finite estimate is flagged");
    assert!(e.elements.iter().all(|x| x.local_percent.is_none()));
}

/// A sequence that has converged and then moves by round-off is converged at the last level,
/// not oscillating.
#[test]
fn richardson_roundoff_after_convergence_is_converged() {
    let (p, ext, err, status) = richardson(&[1.0, 1.001, 1.001 - 1e-13]);
    assert_eq!(status, "converged");
    assert_eq!((p, ext), (None, Some(1.001 - 1e-13)));
    assert!((err.unwrap() - 0.001 / 1.001).abs() < 1e-9);
    // A real reversal is still oscillating.
    assert_eq!(richardson(&[1.0, 1.001, 1.0005]).3, "oscillating");
}


// ==================== Local refinement ====================

/// A flat n × n MITC4 square of side 1 pulled along x by a uniform edge traction of resultant
/// `pull`, held so that the exact answer is a uniform strain.
fn pulled_square(n: usize, pull: f64) -> Model {
    let map = |u: f64, v: f64| ([u, v, 0.0], [0.0, 0.0, 1.0]);
    let bc = |i: usize, j: usize, mx: usize, _my: usize| -> Option<[bool; 6]> {
        if i == 0 {
            Some([true, j == 0, true, false, false, false])
        } else if i == mx {
            Some([false, false, true, false, false, false])
        } else {
            None
        }
    };
    let mut m = surface(Fam::Mitc4, n, n, 0.01, 200_000.0, 0.3, &map, &bc, Load::None);
    for j in 0..n {
        let (a, b) = (m.grid[n][j].0, m.grid[n][j + 1].0);
        let q = m.input.quads.values().find(|q| q.nodes.contains(&a) && q.nodes.contains(&b)).unwrap();
        let edge = (0..4).find(|&e| q.nodes[e] == a && q.nodes[(e + 1) % 4] == b).unwrap();
        m.input.loads.push(SolverLoad3D::QuadEdge(SolverQuadEdgeLoad { element_id: q.id, edge, qn: pull, qt: 0.0 }));
    }
    m
}

/// An L-shaped MITC4 plate (the unit square without its x > ½, y > ½ quarter), clamped along
/// x = 0 and y = 0, under uniform pressure: the re-entrant corner at (½, ½) is a singularity.
fn l_plate(n: usize) -> SolverInput3D {
    assert!(n % 2 == 0);
    let map = |u: f64, v: f64| ([u, v, 0.0], [0.0, 0.0, 1.0]);
    let bc = |i: usize, j: usize, _mx: usize, _my: usize| -> Option<[bool; 6]> { (i == 0 || j == 0).then_some([true; 6]) };
    let mut input = surface(Fam::Mitc4, n, n, 0.01, 200_000.0, 0.3, &map, &bc, Load::Pressure(-1.0)).input;
    let xy: HashMap<usize, (f64, f64)> = input.nodes.values().map(|n| (n.id, (n.x, n.y))).collect();
    let cut: Vec<usize> = input
        .quads
        .values()
        .filter(|q| {
            let (x, y) = q.nodes.iter().fold((0.0, 0.0), |a, n| (a.0 + xy[n].0 / 4.0, a.1 + xy[n].1 / 4.0));
            x > 0.5 && y > 0.5
        })
        .map(|q| q.id)
        .collect();
    input.quads.retain(|_, q| !cut.contains(&q.id));
    input.loads.retain(|l| !matches!(l, SolverLoad3D::QuadPressure(p) if cut.contains(&p.element_id)));
    let used: std::collections::HashSet<usize> = input.quads.values().flat_map(|q| q.nodes).collect();
    input.nodes.retain(|_, n| used.contains(&n.id));
    input.supports.retain(|_, s| used.contains(&s.node_id));
    input
}

/// `l_plate`'s domain as a membrane: held along x = 0 and sheared along its x = 1 edge. The
/// re-entrant corner is a stress singularity.
fn l_membrane(n: usize) -> SolverInput3D {
    let mut input = l_plate(n);
    input.loads.clear();
    input.supports.clear();
    let xy: HashMap<usize, (f64, f64)> = input.nodes.values().map(|n| (n.id, (n.x, n.y))).collect();
    let mut ids: Vec<usize> = xy.keys().copied().collect();
    ids.sort_unstable();
    for (sid, id) in ids.into_iter().enumerate() {
        let held = xy[&id].0 == 0.0;
        input.supports.insert((sid + 1).to_string(), support(id, [held, held, true, true, true, held]));
    }
    for q in input.quads.values() {
        for e in 0..4 {
            if xy[&q.nodes[e]].0 == 1.0 && xy[&q.nodes[(e + 1) % 4]].0 == 1.0 {
                input.loads.push(SolverLoad3D::QuadEdge(SolverQuadEdgeLoad { element_id: q.id, edge: e, qn: 0.0, qt: 100.0 }));
            }
        }
    }
    input
}

fn quad_at(input: &SolverInput3D, x: f64, y: f64) -> ElementKey {
    let xy: HashMap<usize, (f64, f64)> = input.nodes.values().map(|n| (n.id, (n.x, n.y))).collect();
    let holds = |q: &&SolverQuadElement| {
        let (xs, ys): (Vec<f64>, Vec<f64>) = q.nodes.iter().map(|n| xy[n]).unzip();
        let within = |v: &[f64], at: f64| v.iter().cloned().fold(f64::MAX, f64::min) < at && at < v.iter().cloned().fold(f64::MIN, f64::max);
        within(&xs, x) && within(&ys, y)
    };
    ("quad", input.quads.values().find(holds).expect("a quad there").id)
}

fn only(elements: &[ElementKey]) -> std::collections::HashSet<ElementKey> {
    elements.iter().copied().collect()
}

/// Nodes of a flat mesh in the xy-plane that sit inside an element edge without being tied to
/// that edge's ends: each is a crack.
fn cracks(input: &SolverInput3D) -> Vec<(usize, usize, usize)> {
    let hanging = hanging_nodes(input).expect("only hanging-node constraints");
    let xy: HashMap<usize, (f64, f64)> = input.nodes.values().map(|n| (n.id, (n.x, n.y))).collect();
    let mut found = Vec::new();
    for q in input.quads.values() {
        for e in 0..4 {
            let (p, r) = (q.nodes[e], q.nodes[(e + 1) % 4]);
            let (a, b) = (xy[&p], xy[&r]);
            let length2 = (b.0 - a.0).powi(2) + (b.1 - a.1).powi(2);
            for (&k, &c) in &xy {
                let off = (b.0 - a.0) * (c.1 - a.1) - (b.1 - a.1) * (c.0 - a.0);
                let along = ((c.0 - a.0) * (b.0 - a.0) + (c.1 - a.1) * (b.1 - a.1)) / length2;
                let inside = off.abs() < 1e-12 && along > 1e-9 && along < 1.0 - 1e-9;
                if inside && hanging.get(&k) != Some(&(p.min(r), p.max(r))) {
                    found.push((p, r, k));
                }
            }
        }
    }
    found
}

fn same_model(a: &SolverInput3D, b: &SolverInput3D) -> bool {
    serde_json::to_value(a).unwrap() == serde_json::to_value(b).unwrap()
}

#[test]
fn splitting_every_element_is_the_uniform_refinement() {
    for fam in [Fam::Dkt, Fam::Mitc4, Fam::Mitc9, Fam::Curved, Fam::Solid] {
        let m = square_plate(fam, 3, false).input;
        let tag = match fam { Fam::Dkt => "plate", Fam::Mitc4 => "quad", Fam::Mitc9 => "quad9", Fam::Curved => "curvedShell", Fam::Solid => "solidShell" };
        let ids: Vec<usize> = m.plates.values().map(|e| e.id)
            .chain(m.quads.values().map(|e| e.id)).chain(m.quad9s.values().map(|e| e.id))
            .chain(m.curved_shells.values().map(|e| e.id)).chain(m.solid_shells.values().map(|e| e.id)).collect();
        let all: std::collections::HashSet<ElementKey> = ids.iter().map(|id| (tag, *id)).collect();
        for mode in [GeometryMode::Smooth, GeometryMode::Faceted] {
            let uniform = refine_uniform(&m, mode).unwrap();
            let marked_all = refine_marked(&m, mode, &all).unwrap();
            assert!(same_model(&uniform.input, &marked_all.input), "{fam:?} {mode:?}");
            assert_eq!((uniform.caveats, uniform.supports_inferred), (marked_all.caveats, marked_all.supports_inferred), "{fam:?}");
            assert!(marked_all.input.constraints.is_empty());
        }
    }
}

#[test]
fn a_family_that_cannot_carry_a_hanging_node_is_split_as_far_as_it_reaches() {
    for (fam, tag) in [(Fam::Mitc9, "quad9"), (Fam::Curved, "curvedShell"), (Fam::Solid, "solidShell")] {
        let m = square_plate(fam, 3, false).input;
        let first = m.quad9s.values().map(|e| e.id)
            .chain(m.curved_shells.values().map(|e| e.id)).chain(m.solid_shells.values().map(|e| e.id)).min().unwrap();
        let one = refine_marked(&m, GeometryMode::Faceted, &only(&[(tag, first)])).unwrap();
        let uniform = refine_uniform(&m, GeometryMode::Faceted).unwrap();
        assert!(same_model(&one.input, &uniform.input), "{fam:?}");
    }
}

#[test]
fn a_locally_refined_membrane_reproduces_a_uniform_strain_at_every_node() {
    let (pull, t, e) = (10.0, 0.01, 200_000.0 * 1000.0);
    let m = pulled_square(3, pull).input;
    let once = refine_marked(&m, GeometryMode::Faceted, &only(&[quad_at(&m, 0.5, 0.5)])).unwrap().input;
    assert_eq!((once.quads.len(), once.nodes.len(), hanging_nodes(&once).unwrap().len(), once.constraints.len()), (12, 21, 4, 24));
    let twice = refine_marked(&once, GeometryMode::Faceted, &only(&[quad_at(&once, 0.4, 0.4)])).unwrap().input;
    let thrice = refine_marked(&twice, GeometryMode::Faceted, &only(&[quad_at(&twice, 0.36, 0.36), quad_at(&twice, 0.9, 0.9)])).unwrap().input;
    for model in [&once, &twice, &thrice] {
        assert_eq!(cracks(model), vec![]);
        let r = solve(model);
        let strain = pull / t / e;
        let origin = disp(&r, m.nodes.values().find(|n| n.x == 0.0 && n.y == 0.0).unwrap().id);
        for n in model.nodes.values() {
            let d = disp(&r, n.id);
            assert!((d[0] - strain * n.x).abs() <= 1e-9 * strain, "node {} ux {} vs {}", n.id, d[0], strain * n.x);
            assert!((d[1] - origin[1] + 0.3 * strain * n.y).abs() <= 1e-9 * strain, "node {} uy {}", n.id, d[1]);
            assert!(d[2].abs() <= 1e-9 * strain);
        }
        let estimate = estimate(model, &r);
        assert!(estimate.relative_error.unwrap() < 1e-6, "{:?}", estimate.relative_error);
    }
}

#[test]
fn an_element_split_beside_a_hanging_node_splits_the_element_across_and_hangs_on_its_child() {
    let m = pulled_square(3, 10.0).input;
    let once = refine_marked(&m, GeometryMode::Faceted, &only(&[quad_at(&m, 0.5, 0.5)])).unwrap().input;
    let twice = refine_marked(&once, GeometryMode::Faceted, &only(&[quad_at(&once, 0.4, 0.4)])).unwrap().input;
    assert_eq!(cracks(&twice), vec![]);
    let hanging = hanging_nodes(&twice).unwrap();
    let xy: HashMap<usize, (f64, f64)> = twice.nodes.values().map(|n| (n.id, (n.x, n.y))).collect();
    let quarter = 1.0 / 12.0;
    let on_a_child = hanging.iter().filter(|(_, (a, b))| ((xy[a].0 - xy[b].0).abs() + (xy[a].1 - xy[b].1).abs() - 2.0 * quarter).abs() < 1e-12).count();
    assert!(on_a_child >= 2, "{hanging:?}");
    assert!(hanging.values().all(|(a, b)| !hanging.contains_key(a) || !hanging.contains_key(b)));
    for (node, (a, b)) in &hanging {
        assert!((xy[node].0 - 0.5 * (xy[a].0 + xy[b].0)).abs() < 1e-12 && (xy[node].1 - 0.5 * (xy[a].1 + xy[b].1)).abs() < 1e-12);
    }
}

#[test]
fn no_element_is_left_with_hanging_nodes_on_two_edges() {
    let m = pulled_square(4, 10.0).input;
    let refined = refine_marked(&m, GeometryMode::Faceted, &only(&[quad_at(&m, 0.4, 0.4), quad_at(&m, 0.6, 0.6)])).unwrap().input;
    let hanging = hanging_nodes(&refined).unwrap();
    let edges: std::collections::HashSet<(usize, usize)> = hanging.values().copied().collect();
    for q in refined.quads.values() {
        let hung = (0..4).filter(|&e| { let (a, b) = (q.nodes[e], q.nodes[(e + 1) % 4]); edges.contains(&(a.min(b), a.max(b))) }).count();
        assert!(hung <= 1, "quad {} has {hung}", q.id);
    }
    assert_eq!(cracks(&refined), vec![]);
    assert!(refined.quads.len() > 16 + 6);
}

#[test]
fn hanging_nodes_do_not_lock_a_thin_plate() {
    let coarse = l_plate(4);
    let mut reference = coarse.clone();
    for _ in 0..3 {
        reference = refine_uniform(&reference, GeometryMode::Faceted).unwrap().input;
    }
    let exact = energy_norm_sq(&reference, &solve(&reference));
    let mut model = coarse;
    for _ in 0..6 {
        let r = solve(&model);
        model = refine_marked(&model, GeometryMode::Faceted, &marked(&estimate(&model, &r), 0.5)).unwrap().input;
    }
    assert!(!hanging_nodes(&model).unwrap().is_empty());
    assert_eq!(cracks(&model), vec![]);
    let energy = energy_norm_sq(&model, &solve(&model));
    assert!((energy - exact).abs() < 0.02 * exact, "{energy} vs {exact}");
}

#[test]
fn local_refinement_keeps_loads_supports_and_members() {
    let mut m = l_plate(4);
    m.sections.insert("1".into(), SolverSection3D {
        id: 1, name: None, a: 0.01, iy: 1e-5, iz: 1e-5, j: 2e-5, cw: None, as_y: None, as_z: None,
        shear_center_y: None, shear_center_z: None,
    });
    let at = |x: f64, y: f64| m.nodes.values().find(|n| (n.x - x).abs() < 1e-9 && (n.y - y).abs() < 1e-9).unwrap().id;
    let beam = SolverElement3D {
        id: 1000, elem_type: "frame".into(), node_i: at(0.25, 0.25), node_j: at(0.5, 0.25), material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
        release_t_start: false, release_t_end: false, local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    };
    m.elements.insert("1000".into(), beam);
    m.loads.push(SolverLoad3D::Distributed(SolverDistributedLoad3D { element_id: 1000, q_xi: 0.0, q_xj: 0.0, q_yi: 0.0, q_yj: 0.0, q_zi: -2.0, q_zj: -2.0, a: None, b: None }));
    let load = total_reaction(&solve(&m));

    let one_side = refine_marked(&m, GeometryMode::Faceted, &only(&[quad_at(&m, 0.4, 0.1)])).unwrap().input;
    assert_eq!(one_side.elements.len(), 1, "a member along an edge with a hanging node stays whole");
    assert_eq!(hanging_nodes(&one_side).unwrap().len(), 3);
    let both_sides = refine_marked(&m, GeometryMode::Faceted, &only(&[quad_at(&m, 0.4, 0.1), quad_at(&m, 0.4, 0.4)])).unwrap().input;
    assert_eq!(both_sides.elements.len(), 2, "a member along an edge split on both sides is split");
    let later = refine_marked(&one_side, GeometryMode::Faceted, &only(&[quad_at(&one_side, 0.4, 0.4)])).unwrap().input;
    assert_eq!(later.elements.len(), 2, "and is split once the other side catches up");

    for model in [&one_side, &both_sides, &later] {
        assert_eq!(cracks(model), vec![]);
        let total = total_reaction(&solve(model));
        assert!((total[2] - load[2]).abs() < 1e-9 * load[2].abs(), "{total:?} vs {load:?}");
        let supported: std::collections::HashSet<usize> = model.supports.values().map(|s| s.node_id).collect();
        for n in model.nodes.values() {
            assert_eq!(supported.contains(&n.id), n.x.abs() < 1e-9 || n.y.abs() < 1e-9, "node {} at ({}, {})", n.id, n.x, n.y);
        }
    }
}

#[test]
fn constraints_that_are_not_hanging_nodes_are_refused() {
    let m = pulled_square(3, 10.0).input;
    let once = refine_marked(&m, GeometryMode::Faceted, &only(&[quad_at(&m, 0.5, 0.5)])).unwrap().input;
    let centre = only(&[quad_at(&once, 0.1, 0.1)]);
    assert!(refine_marked(&once, GeometryMode::Faceted, &centre).is_ok());
    assert_eq!(refine_uniform(&once, GeometryMode::Faceted).unwrap_err(), "constraints");

    let spoil = |change: &dyn Fn(&mut Vec<Constraint>)| {
        let mut model = once.clone();
        change(&mut model.constraints);
        (hanging_nodes(&model).err(), refine_marked(&model, GeometryMode::Faceted, &centre).err())
    };
    let refused = (Some("constraints".to_string()), Some("constraints".to_string()));
    assert_eq!(spoil(&|c| c.push(Constraint::EqualDOF(EqualDOFConstraint { master_node: 1, slave_node: 2, dofs: vec![0] }))), refused);
    assert_eq!(spoil(&|c| { c.pop(); }), refused, "a node tied in five of its six displacements");
    let term = |c: &mut Vec<Constraint>, i: usize, change: &dyn Fn(&mut MPCTerm)| {
        let Constraint::LinearMPC(mpc) = &mut c[0] else { panic!() };
        change(&mut mpc.terms[i]);
    };
    assert_eq!(spoil(&|c| term(c, 1, &|t| t.coefficient = -0.25)), refused);
    assert_eq!(spoil(&|c| term(c, 0, &|t| t.coefficient = 2.0)), refused);
    assert_eq!(spoil(&|c| term(c, 2, &|t| t.dof = 1)), refused);
    assert_eq!(spoil(&|c| term(c, 2, &|t| t.node_id = 1)), refused, "tied to another edge than its other displacements");
    assert_eq!(spoil(&|c| { let first = c[0].clone(); c.push(first); }), refused, "the same displacement tied twice");

    let unknown = refine_marked(&m, GeometryMode::Faceted, &only(&[("quad", 9999)]));
    assert_eq!(unknown.unwrap_err(), "quad 9999 not found");
    let nothing = refine_marked(&m, GeometryMode::Faceted, &only(&[])).unwrap();
    assert!(same_model(&nothing.input, &m));
}

#[test]
fn the_elements_marked_are_the_fewest_that_carry_the_share_of_the_error() {
    let m = l_membrane(4);
    let mut est = estimate(&m, &solve(&m));
    let etas = [3.0, 1.0, 2.0, 2.0, 0.0, 5.0];
    est.elements.truncate(etas.len());
    for (i, (element, eta)) in est.elements.iter_mut().zip(etas).enumerate() {
        element.eta = eta;
        element.element_id = 10 + i;
        element.kind = "quad".into();
        element.local_percent = Some(1.0);
    }
    est.elements[5].local_percent = None;
    let ids_of = |est: &DiscretizationEstimate, fraction: f64| { let mut v: Vec<usize> = marked(est, fraction).into_iter().map(|(_, id)| id).collect(); v.sort_unstable(); v };
    let ids = |fraction: f64| ids_of(&est, fraction);
    assert_eq!(ids(0.5), vec![10], "9 of 18");
    assert_eq!(ids(0.51), vec![10, 12], "ties go to the lower id");
    assert_eq!(ids(0.75), vec![10, 12, 13]);
    assert_eq!(ids(1.0), vec![10, 11, 12, 13], "never the one without an estimate, nor the one without error");
    let mut unknown = est.clone();
    unknown.elements[0].kind = "membrane".into();
    assert_eq!(ids_of(&unknown, 1.0), vec![11, 12, 13]);
}

#[test]
fn adaptive_refinement_reaches_the_target_with_far_fewer_elements_than_uniform() {
    let coarse = l_membrane(4);
    let target = 0.1;
    let mut uniform = coarse.clone();
    let mut uniform_elements = 0;
    for _ in 0..6 {
        uniform_elements = uniform.quads.len();
        if estimate(&uniform, &solve(&uniform)).relative_error.unwrap() <= target {
            break;
        }
        uniform = refine_uniform(&uniform, GeometryMode::Faceted).unwrap().input;
    }
    let reference = energy_norm_sq(&uniform, &solve(&uniform));

    let options = AdaptOptions { target, max_passes: 20, geometry: GeometryMode::Faceted, ..AdaptOptions::default() };
    let out = adapt_3d(&coarse, &options).unwrap();
    assert_eq!(out.status, "converged");
    assert!(!out.certified && !out.estimate.certified);
    assert!(out.estimate.relative_error.unwrap() <= target);
    let last = out.passes.last().unwrap();
    assert_eq!((last.shell_elements, last.nodes, last.marked), (out.input.quads.len(), out.input.nodes.len(), 0));
    assert_eq!(last.relative_error, out.estimate.relative_error);
    assert!(3 * last.shell_elements < uniform_elements, "{} adaptive, {uniform_elements} uniform", last.shell_elements);
    assert!(out.passes.windows(2).all(|w| w[1].shell_elements > w[0].shell_elements && w[0].marked > 0));
    assert_eq!(out.passes[0].shell_elements, coarse.quads.len());
    assert_eq!(cracks(&out.input), vec![]);
    let energy = energy_norm_sq(&out.input, &solve(&out.input));
    assert!((energy - reference).abs() < 0.02 * reference, "{energy} vs {reference}");

    let again = adapt_3d(&coarse, &options).unwrap();
    assert!(same_model(&out.input, &again.input));

    let max_node = coarse.nodes.values().map(|n| n.id).max().unwrap();
    let (first, last) = (governing(&coarse, &solve(&coarse), max_node), governing(&out.input, &solve(&out.input), max_node));
    assert_eq!(out.quantities.len(), first.len());
    assert!(out.quantities.iter().any(|q| q.quantity == "maxDisplacement") && out.quantities.iter().any(|q| q.quantity == "reaction" && q.node_id.is_some()));
    for q in &out.quantities {
        let key = (q.quantity.clone(), first.keys().find(|k| k.0 == q.quantity && (q.node_id.is_none() || q.node_id == Some(k.1))).unwrap().1);
        assert_eq!(q.model, first[&key], "{}", q.quantity);
        assert_eq!(q.adapted, last.get(&key).copied(), "{}", q.quantity);
    }
    let moved = out.quantities.iter().find(|q| q.quantity == "maxDisplacement").unwrap();
    assert!(moved.adapted.unwrap() > moved.model, "the coarse membrane is too stiff: {moved:?}");
}

#[test]
fn adaptive_refinement_stops_at_its_limits_and_says_which() {
    let coarse = l_membrane(4);
    let tight = AdaptOptions { target: 1e-6, geometry: GeometryMode::Faceted, ..AdaptOptions::default() };

    let passes = adapt_3d(&coarse, &AdaptOptions { max_passes: 2, ..tight.clone() }).unwrap();
    assert_eq!((passes.status.as_str(), passes.passes.len()), ("passLimit", 3));
    let none = adapt_3d(&coarse, &AdaptOptions { max_passes: 0, ..tight.clone() }).unwrap();
    assert_eq!((none.status.as_str(), none.passes.len()), ("passLimit", 1));
    assert!(same_model(&none.input, &coarse));

    let options: AdaptOptions = serde_json::from_str(r#"{"target": 0.2, "maxPasses": 3}"#).unwrap();
    assert_eq!((options.target, options.max_passes, options.fraction, options.max_elements), (0.2, 3, 0.5, 20_000));

    let capped = adapt_3d(&coarse, &AdaptOptions { max_elements: 40, max_passes: 50, ..tight.clone() }).unwrap();
    assert_eq!(capped.status, "elementLimit");
    assert!(capped.input.quads.len() <= 40 && capped.input.quads.len() > coarse.quads.len());
    assert_eq!(capped.passes.last().unwrap().shell_elements, capped.input.quads.len());

    let already = adapt_3d(&coarse, &AdaptOptions { target: 0.9, ..tight.clone() }).unwrap();
    assert_eq!((already.status.as_str(), already.passes.len()), ("converged", 1));
    assert!(same_model(&already.input, &coarse));
    assert!(!already.quantities.is_empty() && already.quantities.iter().all(|q| q.adapted == Some(q.model)));

    let single = square_plate(Fam::Mitc4, 1, true).input;
    let lone = adapt_3d(&single, &tight).unwrap();
    assert_eq!(lone.status, "unestimable");
    assert!(lone.estimate.relative_error.is_none() && lone.estimate.unestimable_reason.is_some());
    assert!(same_model(&lone.input, &single));

    for (options, message) in [
        (AdaptOptions { target: 0.0, ..tight.clone() }, "The target error must be finite and positive"),
        (AdaptOptions { target: f64::NAN, ..tight.clone() }, "The target error must be finite and positive"),
        (AdaptOptions { target: f64::INFINITY, ..tight.clone() }, "The target error must be finite and positive"),
        (AdaptOptions { fraction: 0.0, ..tight.clone() }, "The marked fraction must be over 0 and at most 1"),
        (AdaptOptions { fraction: 1.01, ..tight.clone() }, "The marked fraction must be over 0 and at most 1"),
        (AdaptOptions { fraction: f64::NAN, ..tight.clone() }, "The marked fraction must be over 0 and at most 1"),
        (AdaptOptions { max_passes: 51, ..tight.clone() }, "At most 50 passes"),
        (AdaptOptions { max_passes: usize::MAX, ..tight.clone() }, "At most 50 passes"),
        (AdaptOptions { max_elements: 200_001, ..tight.clone() }, "At most 200000 shell elements"),
    ] {
        assert_eq!(adapt_3d(&coarse, &options).unwrap_err(), message);
    }

    let mut tied = coarse.clone();
    tied.constraints.push(Constraint::EqualDOF(EqualDOFConstraint { master_node: 1, slave_node: 2, dofs: vec![0] }));
    assert_eq!(adapt_3d(&tied, &tight).unwrap_err(), "constraints");
}

fn rotated(tilt: bool, p: [f64; 3]) -> [f64; 3] {
    if !tilt {
        return p;
    }
    let (a, b) = (0.6_f64, 0.9_f64);
    let q = [p[0], p[1] * a.cos() - p[2] * a.sin(), p[1] * a.sin() + p[2] * a.cos()];
    [q[0] * b.cos() - q[1] * b.sin(), q[0] * b.sin() + q[1] * b.cos(), q[2]]
}

/// An n × n MITC4 square with ν = 0, clamped along u = 0 and bent by a uniform moment along
/// u = 1: a cylinder of constant curvature.
fn bent_square(n: usize, tilt: bool) -> Model {
    let map = move |u: f64, v: f64| (rotated(tilt, [u, v, 0.0]), rotated(tilt, [0.0, 0.0, 1.0]));
    let bc = |i: usize, _j: usize, _mx: usize, _my: usize| -> Option<[bool; 6]> { (i == 0).then_some([true; 6]) };
    let mut m = surface(Fam::Mitc4, n, n, 0.01, 200_000.0, 0.0, &map, &bc, Load::None);
    let axis = rotated(tilt, [0.0, 1.0, 0.0]);
    for j in 0..=n {
        let share = if j == 0 || j == n { 0.5 } else { 1.0 } / n as f64;
        m.input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: m.grid[n][j].0, fx: 0.0, fy: 0.0, fz: 0.0, mx: share * axis[0], my: share * axis[1], mz: share * axis[2], bw: None,
        }));
    }
    m
}

fn element_at(input: &SolverInput3D, tilt: bool, u: f64, v: f64) -> ElementKey {
    let target = rotated(tilt, [u, v, 0.0]);
    let c: HashMap<usize, [f64; 3]> = input.nodes.values().map(|n| (n.id, [n.x, n.y, n.z])).collect();
    let far = |q: &SolverQuadElement| {
        let mid = q.nodes.iter().fold([0.0; 3], |a, n| [a[0] + c[n][0] / 4.0, a[1] + c[n][1] / 4.0, a[2] + c[n][2] / 4.0]);
        (0..3).map(|k| (mid[k] - target[k]).powi(2)).sum::<f64>()
    };
    ("quad", input.quads.values().min_by(|a, b| far(a).total_cmp(&far(b))).unwrap().id)
}

#[test]
fn a_locally_refined_plate_reproduces_a_constant_curvature_in_any_plane() {
    for tilt in [false, true] {
        let m = bent_square(4, tilt).input;
        let (normal, along) = (rotated(tilt, [0.0, 0.0, 1.0]), rotated(tilt, [1.0, 0.0, 0.0]));
        let once = refine_marked(&m, GeometryMode::Faceted, &only(&[element_at(&m, tilt, 0.375, 0.375)])).unwrap().input;
        let twice = refine_marked(&once, GeometryMode::Faceted, &only(&[element_at(&once, tilt, 0.3, 0.3)])).unwrap().input;
        let thrice = refine_marked(&twice, GeometryMode::Faceted, &only(&[element_at(&twice, tilt, 0.27, 0.27)])).unwrap().input;
        assert_eq!(hanging_nodes(&thrice).unwrap().len(), 16);
        let coarse_tip = { let r = solve(&m); let d = disp(&r, m.nodes.values().find(|n| n.id == 25).unwrap().id); dot3(d, normal) };
        for model in [&m, &once, &twice, &thrice] {
            let r = solve(model);
            for n in model.nodes.values() {
                let u = dot3([n.x, n.y, n.z], along);
                let w = dot3(disp(&r, n.id), normal);
                assert!((w - coarse_tip * u * u).abs() <= 1e-8 * coarse_tip.abs(), "tilt {tilt}, node {} at {u}: {w} vs {}", n.id, coarse_tip * u * u);
            }
        }
    }
}

fn dot3(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

#[test]
fn local_refinements_one_after_another_leave_no_crack_and_keep_a_uniform_strain() {
    let (pull, t, e) = (10.0, 0.01, 200_000.0 * 1000.0);
    let mut seed: u64 = 12345;
    let mut next = move || { seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407); (seed >> 33) as usize };
    let mut model = pulled_square(4, pull).input;
    for round in 0..6 {
        let mut ids: Vec<usize> = model.quads.values().map(|q| q.id).collect();
        ids.sort_unstable();
        let picks: Vec<ElementKey> = (0..1 + ids.len() / 12).map(|_| ("quad", ids[next() % ids.len()])).collect();
        model = refine_marked(&model, GeometryMode::Faceted, &only(&picks)).unwrap().input;
        assert_eq!(cracks(&model), vec![], "round {round}");
        let r = solve(&model);
        let strain = pull / t / e;
        for n in model.nodes.values() {
            assert!((disp(&r, n.id)[0] - strain * n.x).abs() <= 1e-9 * strain, "round {round}, node {}", n.id);
        }
    }
    assert!(model.quads.len() > 300 && !hanging_nodes(&model).unwrap().is_empty());
}

#[test]
fn a_curved_roof_refined_locally_deflects_as_the_one_refined_everywhere() {
    let m = scordelis(Fam::Mitc4, 4);
    let free_edge = m.grid[0][4];
    for mode in [GeometryMode::Smooth, GeometryMode::Faceted] {
        let mut uniform = m.input.clone();
        for _ in 0..3 {
            uniform = refine_uniform(&uniform, mode).unwrap().input;
        }
        let reference = mid_disp(&solve(&uniform), free_edge)[2];
        let mut model = m.input.clone();
        for _ in 0..6 {
            let r = solve(&model);
            model = refine_marked(&model, mode, &marked(&estimate(&model, &r), 0.5)).unwrap().input;
        }
        assert!(!hanging_nodes(&model).unwrap().is_empty());
        assert!(model.quads.len() < uniform.quads.len());
        let got = mid_disp(&solve(&model), free_edge)[2];
        assert!((got - reference).abs() < 0.02 * reference.abs(), "{mode:?}: {got} vs {reference}");
    }
}

#[test]
fn no_hanging_node_is_left_on_a_fold() {
    let map = |u: f64, v: f64| if u <= 0.5 { ([u, v, 0.0], [0.0, 0.0, 1.0]) } else { ([0.5, v, u - 0.5], [-1.0, 0.0, 0.0]) };
    let bc = |i: usize, _j: usize, _mx: usize, _my: usize| -> Option<[bool; 6]> { (i == 0).then_some([true; 6]) };
    let mut m = surface(Fam::Mitc4, 4, 2, 0.01, 200_000.0, 0.3, &map, &bc, Load::None);
    for j in 0..=2 {
        m.input.loads.push(nodal(m.grid[4][j].0, [1.0, 0.0, 0.0]));
    }
    let c: HashMap<usize, [f64; 3]> = m.input.nodes.values().map(|n| (n.id, [n.x, n.y, n.z])).collect();
    let beside = m.input.quads.values().find(|q| q.nodes.iter().all(|n| c[n][2] == 0.0 && c[n][0] >= 0.25 && c[n][1] <= 0.5)).unwrap().id;
    let refined = refine_marked(&m.input, GeometryMode::Faceted, &only(&[("quad", beside)])).unwrap().input;
    let cr: HashMap<usize, [f64; 3]> = refined.nodes.values().map(|n| (n.id, [n.x, n.y, n.z])).collect();
    let hanging = hanging_nodes(&refined).unwrap();
    assert!(!hanging.is_empty());
    assert!(hanging.keys().all(|n| !(cr[n][0] == 0.5 && cr[n][2] == 0.0)), "{hanging:?}");
    let across = refined.quads.values().filter(|q| q.nodes.iter().all(|n| cr[n][0] == 0.5 && cr[n][1] <= 0.5 && cr[n][2] <= 0.25)).count();
    assert_eq!(across, 4, "the element across the fold is split with it");
    let total = total_reaction(&solve(&refined));
    assert!((total[0] + 3.0).abs() < 1e-9, "{total:?}");
}

#[test]
fn the_adapted_mesh_is_told_as_changes_to_the_model_given() {
    let mut coarse = l_membrane(4);
    coarse.sections.insert("1".into(), SolverSection3D {
        id: 1, name: None, a: 0.01, iy: 1e-5, iz: 1e-5, j: 2e-5, cw: None, as_y: None, as_z: None,
        shear_center_y: None, shear_center_z: None,
    });
    let at = |x: f64, y: f64| coarse.nodes.values().find(|n| (n.x - x).abs() < 1e-9 && (n.y - y).abs() < 1e-9).unwrap().id;
    let (end_i, end_j) = (at(0.25, 0.5), at(0.5, 0.5));
    coarse.elements.insert("1000".into(), beam(1000, end_i, end_j));
    let options = AdaptOptions { target: 0.1, max_passes: 20, geometry: GeometryMode::Faceted, ..AdaptOptions::default() };
    let out = adapt_3d(&coarse, &options).unwrap();
    assert_eq!(out.status, "converged");
    let max_node = coarse.nodes.values().map(|n| n.id).max().unwrap();
    let place = |id: usize| out.input.nodes.values().find(|n| n.id == id).map(|n| [n.x, n.y, n.z]).unwrap();
    let mesh = &out.mesh;

    let added: Vec<usize> = mesh.nodes.iter().map(|n| n.id).collect();
    let mut expected: Vec<usize> = out.input.nodes.values().map(|n| n.id).filter(|id| *id > max_node).collect();
    expected.sort_unstable();
    assert_eq!(added, expected);
    for n in &mesh.nodes {
        assert_eq!([n.x, n.y, n.z], place(n.id));
        if let Some([a, b]) = n.between {
            let (pa, pb) = (place(a), place(b));
            for k in 0..3 {
                assert!((0.5 * (pa[k] + pb[k]) - place(n.id)[k]).abs() < 1e-12);
            }
        }
    }
    assert!(mesh.nodes.iter().any(|n| n.between.is_some()) && mesh.nodes.iter().any(|n| n.between.is_none()));

    let mut ids: Vec<usize> = mesh.shells.iter().map(|s| s.id).collect();
    let split: std::collections::HashSet<usize> = mesh.shells.iter().map(|s| s.parent).collect();
    assert!(!split.is_empty());
    ids.extend(coarse.quads.values().map(|q| q.id).filter(|id| !split.contains(id)));
    ids.sort_unstable();
    let mut last: Vec<usize> = out.input.quads.values().map(|q| q.id).collect();
    last.sort_unstable();
    assert_eq!(ids, last);
    let deepest = mesh.shells.iter().flat_map(|s| s.weights.iter().flatten()).filter(|w| **w > 0.0).cloned().fold(1.0, f64::min);
    assert!(deepest < 0.25, "some element is a part of a part: {deepest}");
    for s in &mesh.shells {
        assert_eq!(s.family, "quad");
        let parent = coarse.quads.values().find(|q| q.id == s.parent).unwrap().nodes;
        assert_eq!(s.nodes, out.input.quads.values().find(|q| q.id == s.id).unwrap().nodes.to_vec());
        for (corner, row) in s.nodes.iter().zip(&s.weights) {
            assert!((row.iter().sum::<f64>() - 1.0).abs() < 1e-12);
            for k in 0..3 {
                let there: f64 = row.iter().zip(parent).map(|(w, n)| w * place(n)[k]).sum();
                assert!((there - place(*corner)[k]).abs() < 1e-12, "element {} corner {corner}", s.id);
            }
        }
    }

    let [frame] = mesh.frames.as_slice() else { panic!("{:?}", mesh.frames) };
    assert_eq!(frame.parent, 1000);
    assert!(!frame.nodes.is_empty() && frame.at.windows(2).all(|w| w[0] < w[1]));
    assert_eq!(out.input.elements.len(), frame.nodes.len() + 1);
    let (pi, pj) = (place(end_i), place(end_j));
    for (node, t) in frame.nodes.iter().zip(&frame.at) {
        for k in 0..3 {
            assert!((pi[k] + t * (pj[k] - pi[k]) - place(*node)[k]).abs() < 1e-12, "node {node} at {t}");
        }
    }
    let mut chain = vec![end_i];
    chain.extend(&frame.nodes);
    chain.push(end_j);
    for pair in chain.windows(2) {
        assert!(out.input.elements.values().any(|e| (e.node_i, e.node_j) == (pair[0], pair[1])), "{pair:?}");
    }

    let given: HashMap<usize, [bool; 6]> = mesh.supports.iter().map(|s| (s.node_id, s.restrained)).collect();
    let held: HashMap<usize, [bool; 6]> =
        out.input.supports.values().filter(|s| s.node_id > max_node).map(|s| (s.node_id, [s.rx, s.ry, s.rz, s.rrx, s.rry, s.rrz])).collect();
    assert!(!given.is_empty());
    assert_eq!(given, held);
    assert!(mesh.supports.iter().all(|s| s.plain));

    let hanging = hanging_nodes(&out.input).unwrap();
    assert!(!hanging.is_empty());
    assert_eq!(mesh.constraints.len(), 6 * hanging.len());
    assert!(mesh.constraints.iter().all(|terms| hanging.contains_key(&terms[0].node_id)));

    let untouched = adapt_3d(&coarse, &AdaptOptions { target: 0.9, ..options }).unwrap().mesh;
    assert!(untouched.nodes.is_empty() && untouched.shells.is_empty() && untouched.frames.is_empty() && untouched.constraints.is_empty());
}

/// The quads of `input` that `which` picks, each as two DKT triangles with its loads.
fn as_triangles(input: &mut SolverInput3D, which: &dyn Fn([f64; 2]) -> bool) {
    let xy: HashMap<usize, (f64, f64)> = input.nodes.values().map(|n| (n.id, (n.x, n.y))).collect();
    let mut quads: Vec<SolverQuadElement> = input.quads.values().cloned().collect();
    quads.sort_by_key(|q| q.id);
    let mut next = quads.iter().map(|q| q.id).max().unwrap_or(0) + 1;
    for q in quads {
        let centre = q.nodes.iter().fold([0.0; 2], |a, n| [a[0] + xy[n].0 / 4.0, a[1] + xy[n].1 / 4.0]);
        if !which(centre) {
            continue;
        }
        input.quads.remove(&q.id.to_string());
        let [a, b, c, d] = q.nodes;
        let mut made = Vec::new();
        for nodes in [[a, b, c], [a, c, d]] {
            input.plates.insert(next.to_string(), SolverPlateElement { id: next, nodes, material_id: q.material_id, thickness: q.thickness });
            made.push(next);
            next += 1;
        }
        let mut loads = Vec::new();
        for load in input.loads.drain(..) {
            match &load {
                SolverLoad3D::QuadPressure(p) if p.element_id == q.id => {
                    loads.extend(made.iter().map(|&element_id| SolverLoad3D::Pressure(SolverPressureLoad { element_id, pressure: p.pressure })));
                }
                _ => loads.push(load),
            }
        }
        input.loads = loads;
    }
}

/// Edges of the shell elements of a flat mesh that only one element has and that are not on
/// the outline `outside` tells: a node left hanging, or a hole.
fn open_edges(input: &SolverInput3D, outside: &dyn Fn([f64; 2], [f64; 2]) -> bool) -> Vec<(usize, usize)> {
    let hanging = hanging_nodes(input).expect("only hanging-node constraints");
    let xy: HashMap<usize, [f64; 2]> = input.nodes.values().map(|n| (n.id, [n.x, n.y])).collect();
    let mut count: HashMap<(usize, usize), usize> = HashMap::new();
    let mut ring = |nodes: &[usize]| {
        for k in 0..nodes.len() {
            let (a, b) = (nodes[k], nodes[(k + 1) % nodes.len()]);
            *count.entry((a.min(b), a.max(b))).or_default() += 1;
        }
    };
    input.plates.values().for_each(|e| ring(&e.nodes));
    input.quads.values().for_each(|e| ring(&e.nodes));
    let halves: std::collections::HashSet<(usize, usize)> =
        hanging.iter().flat_map(|(&node, &(a, b))| [(a.min(node), a.max(node)), (b.min(node), b.max(node)), (a, b)]).collect();
    let mut open: Vec<(usize, usize)> =
        count.into_iter().filter(|(edge, n)| *n == 1 && !outside(xy[&edge.0], xy[&edge.1]) && !halves.contains(edge)).map(|(edge, _)| edge).collect();
    open.sort_unstable();
    open
}

fn on_unit_square(a: [f64; 2], b: [f64; 2]) -> bool {
    (0..2).any(|k| (a[k] == b[k]) && (a[k] == 0.0 || a[k] == 1.0))
}

/// Twice the signed area of each triangle and its smallest angle in degrees.
fn triangle_shapes(input: &SolverInput3D) -> Vec<(f64, f64)> {
    let xy: HashMap<usize, [f64; 2]> = input.nodes.values().map(|n| (n.id, [n.x, n.y])).collect();
    input
        .plates
        .values()
        .map(|p| {
            let c = p.nodes.map(|n| xy[&n]);
            let twice = (c[1][0] - c[0][0]) * (c[2][1] - c[0][1]) - (c[1][1] - c[0][1]) * (c[2][0] - c[0][0]);
            let angle = (0..3)
                .map(|k| {
                    let (u, v) = ([c[(k + 1) % 3][0] - c[k][0], c[(k + 1) % 3][1] - c[k][1]], [c[(k + 2) % 3][0] - c[k][0], c[(k + 2) % 3][1] - c[k][1]]);
                    ((u[0] * v[0] + u[1] * v[1]) / (u[0].hypot(u[1]) * v[0].hypot(v[1]))).clamp(-1.0, 1.0).acos().to_degrees()
                })
                .fold(f64::MAX, f64::min);
            (twice, angle)
        })
        .collect()
}

fn plate_at(input: &SolverInput3D, x: f64, y: f64) -> ElementKey {
    let xy: HashMap<usize, [f64; 2]> = input.nodes.values().map(|n| (n.id, [n.x, n.y])).collect();
    let far = |p: &SolverPlateElement| {
        let mid = p.nodes.iter().fold([0.0; 2], |a, n| [a[0] + xy[n][0] / 3.0, a[1] + xy[n][1] / 3.0]);
        (mid[0] - x).powi(2) + (mid[1] - y).powi(2)
    };
    ("plate", input.plates.values().min_by(|a, b| far(a).total_cmp(&far(b)).then(a.id.cmp(&b.id))).unwrap().id)
}

#[test]
fn a_triangle_mesh_is_refined_where_it_is_marked_with_no_node_left_hanging() {
    let coarse = square_plate(Fam::Dkt, 4, false).input;
    let load = total_reaction(&solve(&coarse));
    let uniform = refine_uniform(&coarse, GeometryMode::Faceted).unwrap().input;
    let refined = refine_marked(&coarse, GeometryMode::Faceted, &only(&[plate_at(&coarse, 0.1, 0.05)])).unwrap();
    let one = &refined.input;
    assert!(one.plates.len() > coarse.plates.len() && 2 * one.plates.len() < uniform.plates.len(), "{} of {}", one.plates.len(), uniform.plates.len());
    assert!(one.constraints.is_empty());

    let place = |id: usize| one.nodes.values().find(|n| n.id == id).map(|n| [n.x, n.y, n.z]).unwrap();
    let mut parts = std::collections::HashSet::new();
    for split in &refined.splits {
        let parent = coarse.plates.values().find(|p| p.id == split.parent).unwrap().nodes;
        assert!((2..=4).contains(&split.children.len()));
        parts.insert(split.children.len());
        for (child, weights) in &split.children {
            let nodes = one.plates.values().find(|p| p.id == *child).unwrap().nodes;
            for (corner, row) in nodes.iter().zip(weights) {
                for k in 0..3 {
                    let there: f64 = row.iter().zip(parent).map(|(w, n)| w * place(n)[k]).sum();
                    assert!((there - place(*corner)[k]).abs() < 1e-12);
                }
            }
        }
    }
    assert!(parts.contains(&4) && (parts.contains(&2) || parts.contains(&3)), "{parts:?}");

    let mut model = one.clone();
    let mut seed: u64 = 2024;
    let mut next = move || { seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407); (seed >> 33) as usize };
    let coarsest_angle = triangle_shapes(&coarse).iter().map(|s| s.1).fold(f64::MAX, f64::min);
    for round in 0..8 {
        assert_eq!(open_edges(&model, &on_unit_square), vec![], "round {round}");
        assert!(model.constraints.is_empty());
        let shapes = triangle_shapes(&model);
        assert!(shapes.iter().all(|s| s.0 > 0.0), "round {round}: a triangle turned over");
        assert!((shapes.iter().map(|s| s.0).sum::<f64>() - 2.0).abs() < 1e-12, "round {round}: the area changed");
        let sharpest = shapes.iter().map(|s| s.1).fold(f64::MAX, f64::min);
        assert!(sharpest >= 0.5 * coarsest_angle - 1e-9, "round {round}: {sharpest}° from {coarsest_angle}°");
        let total = total_reaction(&solve(&model));
        assert!((total[2] - load[2]).abs() < 1e-9 * load[2].abs(), "round {round}: {total:?} vs {load:?}");
        let mut ids: Vec<usize> = model.plates.values().map(|p| p.id).collect();
        ids.sort_unstable();
        let marks: Vec<ElementKey> = (0..3).map(|_| ("plate", ids[next() % ids.len()])).collect();
        model = refine_marked(&model, GeometryMode::Faceted, &only(&marks)).unwrap().input;
    }
    assert!(model.plates.len() < 4 * uniform.plates.len());
}

#[test]
fn a_locally_refined_triangle_mesh_reproduces_a_constant_curvature_in_any_plane() {
    for tilt in [false, true] {
        let map = move |u: f64, v: f64| (rotated(tilt, [u, v, 0.0]), rotated(tilt, [0.0, 0.0, 1.0]));
        let bc = |i: usize, _j: usize, _mx: usize, _my: usize| -> Option<[bool; 6]> { (i == 0).then_some([true; 6]) };
        let mut built = surface(Fam::Dkt, 4, 4, 0.01, 200_000.0, 0.0, &map, &bc, Load::None);
        let axis = rotated(tilt, [0.0, 1.0, 0.0]);
        for j in 0..=4 {
            let share = if j == 0 || j == 4 { 0.5 } else { 1.0 } / 4.0;
            built.input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: built.grid[4][j].0, fx: 0.0, fy: 0.0, fz: 0.0, mx: share * axis[0], my: share * axis[1], mz: share * axis[2], bw: None,
            }));
        }
        let m = built.input;
        let (normal, along) = (rotated(tilt, [0.0, 0.0, 1.0]), rotated(tilt, [1.0, 0.0, 0.0]));
        let nearest = |input: &SolverInput3D, u: f64, v: f64| -> ElementKey {
            let target = rotated(tilt, [u, v, 0.0]);
            let c: HashMap<usize, [f64; 3]> = input.nodes.values().map(|n| (n.id, [n.x, n.y, n.z])).collect();
            let far = |p: &SolverPlateElement| {
                let mid = p.nodes.iter().fold([0.0; 3], |a, n| [a[0] + c[n][0] / 3.0, a[1] + c[n][1] / 3.0, a[2] + c[n][2] / 3.0]);
                (0..3).map(|k| (mid[k] - target[k]).powi(2)).sum::<f64>()
            };
            ("plate", input.plates.values().min_by(|a, b| far(a).total_cmp(&far(b)).then(a.id.cmp(&b.id))).unwrap().id)
        };
        let once = refine_marked(&m, GeometryMode::Faceted, &only(&[nearest(&m, 0.4, 0.35)])).unwrap().input;
        let twice = refine_marked(&once, GeometryMode::Faceted, &only(&[nearest(&once, 0.3, 0.3)])).unwrap().input;
        let thrice = refine_marked(&twice, GeometryMode::Faceted, &only(&[nearest(&twice, 0.27, 0.27)])).unwrap().input;
        assert!(thrice.constraints.is_empty() && thrice.plates.len() > twice.plates.len() && twice.plates.len() > once.plates.len());
        let tip = { let r = solve(&m); dot3(disp(&r, built.grid[4][0].0), normal) };
        assert!(tip.abs() > 1e-9);
        for model in [&m, &once, &twice, &thrice] {
            let r = solve(model);
            for n in model.nodes.values() {
                let u = dot3([n.x, n.y, n.z], along);
                let w = dot3(disp(&r, n.id), normal);
                assert!((w - tip * u * u).abs() <= 1e-8 * tip.abs(), "tilt {tilt}, node {} at {u}: {w} vs {}", n.id, tip * u * u);
            }
        }
    }
}

#[test]
fn triangles_and_quads_meet_without_a_crack_whichever_is_split() {
    let mut m = bent_square(4, false).input;
    as_triangles(&mut m, &|centre| centre[0] < 0.5);
    assert_eq!((m.plates.len(), m.quads.len()), (16, 8));
    let tip = { let r = solve(&m); disp(&r, m.nodes.values().find(|n| n.x == 1.0 && n.y == 0.0).unwrap().id)[2] };

    let quad_side = refine_marked(&m, GeometryMode::Faceted, &only(&[quad_at(&m, 0.6, 0.4)])).unwrap().input;
    assert_eq!(quad_side.quads.len(), 8 + 3);
    assert!(quad_side.plates.len() > 16 && quad_side.plates.len() < 24, "{}", quad_side.plates.len());
    let hung = hanging_nodes(&quad_side).unwrap();
    assert_eq!(hung.len(), 3);
    let x_of = |input: &SolverInput3D, id: usize| input.nodes.values().find(|n| n.id == id).unwrap().x;
    assert!(hung.keys().all(|node| x_of(&quad_side, *node) > 0.5), "no node hangs on the edge a triangle has");

    let triangle_side = refine_marked(&m, GeometryMode::Faceted, &only(&[plate_at(&m, 0.45, 0.4)])).unwrap().input;
    assert_eq!(triangle_side.quads.len(), 8);
    let hung = hanging_nodes(&triangle_side).unwrap();
    assert_eq!(hung.len(), 1, "the quad across carries the node the triangle put on their edge");
    assert!(hung.keys().all(|node| x_of(&triangle_side, *node) == 0.5));

    let both = refine_marked(&quad_side, GeometryMode::Faceted, &only(&[plate_at(&quad_side, 0.45, 0.4), quad_at(&quad_side, 0.55, 0.45)])).unwrap().input;

    let mut spanned_by_a_triangle = triangle_side.clone();
    let (&node, &(a, b)) = hung.iter().next().unwrap();
    let apex = m.quads.values().flat_map(|q| q.nodes).find(|n| ![a, b, node].contains(n)).unwrap();
    spanned_by_a_triangle.plates.insert("9000".into(), SolverPlateElement { id: 9000, nodes: [a, b, apex], material_id: 1, thickness: 0.01 });
    assert_eq!(hanging_nodes(&spanned_by_a_triangle), Err("constraints".to_string()), "a triangle cannot span an edge with a node hanging on it");
    for model in [&quad_side, &triangle_side, &both] {
        assert_eq!(open_edges(model, &on_unit_square), vec![]);
        assert_eq!(cracks(model), vec![]);
        let r = solve(model);
        for n in model.nodes.values() {
            let w = disp(&r, n.id)[2];
            assert!((w - tip * n.x * n.x).abs() <= 1e-8 * tip.abs(), "node {} at {}: {w} vs {}", n.id, n.x, tip * n.x * n.x);
        }
    }
}

#[test]
fn adaptive_refinement_of_triangles_reaches_the_target_with_fewer_elements_than_uniform() {
    let mut coarse = l_plate(4);
    as_triangles(&mut coarse, &|_| true);
    let target = 0.5 * estimate(&coarse, &solve(&coarse)).relative_error.unwrap();
    let mut uniform = coarse.clone();
    let mut uniform_elements = 0;
    for _ in 0..6 {
        uniform_elements = uniform.plates.len();
        if estimate(&uniform, &solve(&uniform)).relative_error.unwrap() <= target {
            break;
        }
        uniform = refine_uniform(&uniform, GeometryMode::Faceted).unwrap().input;
    }
    assert_eq!(uniform.plates.len(), uniform_elements, "the uniform sequence reached the target");
    let reference = energy_norm_sq(&uniform, &solve(&uniform));
    let out = adapt_3d(&coarse, &AdaptOptions { target, max_passes: 20, geometry: GeometryMode::Faceted, ..AdaptOptions::default() }).unwrap();
    assert_eq!(out.status, "converged");
    assert!(out.input.constraints.is_empty() && out.passes.iter().all(|p| p.hanging_nodes == 0));
    assert!(out.input.plates.len() < uniform_elements, "{} adaptive, {uniform_elements} uniform", out.input.plates.len());
    let l_outline = |a: [f64; 2], b: [f64; 2]| on_unit_square(a, b) || (0..2).any(|k| a[k] == 0.5 && b[k] == 0.5 && a[1 - k] >= 0.5 && b[1 - k] >= 0.5);
    assert_eq!(open_edges(&out.input, &l_outline), vec![]);
    let energy = energy_norm_sq(&out.input, &solve(&out.input));
    assert!((energy - reference).abs() < 0.05 * reference, "{energy} vs {reference}");
    assert!(out.mesh.shells.iter().all(|s| s.family == "plate" && s.weights.len() == 3) && !out.mesh.shells.is_empty());
}

#[test]
fn a_constraint_that_only_looks_like_a_hanging_node_is_refused() {
    let m = bent_square(3, false).input;
    let once = refine_marked(&m, GeometryMode::Faceted, &only(&[element_at(&m, false, 0.5, 0.5)])).unwrap().input;
    let hung = hanging_nodes(&once).unwrap();
    assert_eq!(hung.len(), 4);
    let refused = Err("constraints".to_string());
    let bent = once
        .constraints
        .iter()
        .position(|c| matches!(c, Constraint::LinearMPC(mpc) if mpc.terms.len() > 3))
        .expect("a plate's hanging node is tied with the bending term");

    let mut other_bending = once.clone();
    let Constraint::LinearMPC(mpc) = &mut other_bending.constraints[bent] else { panic!() };
    mpc.terms[3].coefficient *= 2.0;
    assert_eq!(hanging_nodes(&other_bending), refused);

    let mut plain_mean = once.clone();
    let Constraint::LinearMPC(mpc) = &mut plain_mean.constraints[bent] else { panic!() };
    mpc.terms.truncate(3);
    assert_eq!(hanging_nodes(&plain_mean), refused);

    let mut off_the_middle = once.clone();
    let node = *hung.keys().min().unwrap();
    off_the_middle.nodes.values_mut().find(|n| n.id == node).unwrap().x += 1e-3;
    assert_eq!(hanging_nodes(&off_the_middle), refused);

    let mut elsewhere = m.clone();
    let (tied, a, b) = (m.quads["5"].nodes[0], m.quads["1"].nodes[0], m.quads["9"].nodes[2]);
    for dof in 0..6 {
        elsewhere.constraints.push(Constraint::LinearMPC(LinearMPCConstraint {
            terms: vec![
                MPCTerm { node_id: tied, dof, coefficient: 1.0 },
                MPCTerm { node_id: a, dof, coefficient: -0.5 },
                MPCTerm { node_id: b, dof, coefficient: -0.5 },
            ],
        }));
    }
    assert_eq!(hanging_nodes(&elsewhere), refused, "the mean of two nodes that are not the ends of an edge");
    assert_eq!(refine_marked(&elsewhere, GeometryMode::Faceted, &only(&[element_at(&m, false, 0.5, 0.5)])).err(), Some("constraints".to_string()));
    assert_eq!(adapt_3d(&elsewhere, &AdaptOptions { target: 1e-6, ..AdaptOptions::default() }).err(), Some("constraints".to_string()));
}

/// `l_membrane`'s domain held along x = 0 and sheared by forces at the nodes of its x = 1 edge:
/// under each force the strain energy of a membrane is unbounded, and no mesh resolves it.
fn l_membrane_under_point_forces(scale: f64) -> SolverInput3D {
    let mut input = l_membrane(4);
    input.loads.clear();
    let loaded: Vec<(usize, f64)> = input.nodes.values().filter(|n| n.x == 1.0).map(|n| (n.id, n.y)).collect();
    for (node_id, y) in loaded {
        let share = if y == 0.0 || y == 0.5 { 0.5 } else { 1.0 } * 25.0;
        input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id, fx: 0.0, fy: share, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
    }
    for n in input.nodes.values_mut() {
        (n.x, n.y) = (scale * n.x, scale * n.y);
    }
    input
}

fn smallest_edge(input: &SolverInput3D) -> f64 {
    let at: HashMap<usize, [f64; 2]> = input.nodes.values().map(|n| (n.id, [n.x, n.y])).collect();
    input
        .quads
        .values()
        .flat_map(|q| (0..4).map(|k| (at[&q.nodes[k]], at[&q.nodes[(k + 1) % 4]])).collect::<Vec<_>>())
        .map(|(a, b)| (a[0] - b[0]).hypot(a[1] - b[1]))
        .fold(f64::MAX, f64::min)
}

#[test]
fn adaptive_refinement_stops_where_refining_no_longer_brings_the_error_down() {
    let coarse = l_membrane_under_point_forces(1.0);
    let options = AdaptOptions { target: 0.01, max_passes: 40, max_levels: 4, geometry: GeometryMode::Faceted, ..AdaptOptions::default() };
    let out = adapt_3d(&coarse, &options).unwrap();
    assert_eq!(out.status, "depthLimit");
    assert!(out.refused.is_none());
    assert!(out.passes.len() > 4 && out.passes.len() < 40, "{} passes", out.passes.len());
    assert!(out.estimate.relative_error.unwrap() > options.target);
    assert_eq!(out.passes.last().unwrap().shell_elements, out.input.quads.len());
    let floor = smallest_edge(&coarse) / 16.0;
    assert!(smallest_edge(&out.input) >= 0.5 * floor, "{} under {floor}", smallest_edge(&out.input));
    assert!((smallest_edge(&out.input) - floor).abs() < 1e-12 || smallest_edge(&out.input) < floor, "the limit was reached");
    assert_eq!(cracks(&out.input), vec![]);

    let deeper = adapt_3d(&coarse, &AdaptOptions { max_levels: 6, ..options.clone() }).unwrap();
    assert_eq!(deeper.status, "depthLimit");
    assert!(deeper.input.quads.len() > out.input.quads.len());

    let none = adapt_3d(&coarse, &AdaptOptions { max_levels: 0, ..options.clone() }).unwrap();
    assert_eq!((none.status.as_str(), none.passes.len(), none.input.quads.len()), ("depthLimit", 1, coarse.quads.len()));
    assert_eq!(adapt_3d(&coarse, &AdaptOptions { max_levels: 17, ..options }).unwrap_err(), "At most 16 levels");
}

#[test]
fn a_mesh_the_solver_refuses_ends_the_refinement_at_the_last_one_it_solved() {
    let coarse = l_membrane_under_point_forces(2e-6);
    let options = AdaptOptions { target: 0.01, max_passes: 40, max_levels: 16, geometry: GeometryMode::Faceted, ..AdaptOptions::default() };
    let out = adapt_3d(&coarse, &options).unwrap();
    assert_eq!(out.status, "refused");
    assert!(out.refused.as_deref().is_some_and(|reason| reason.contains("MITC4")), "{:?}", out.refused);
    assert!(out.passes.len() > 1, "{} passes", out.passes.len());
    let last = out.passes.last().unwrap();
    assert_eq!((last.shell_elements, last.marked), (out.input.quads.len(), 0));
    assert_eq!(last.relative_error, out.estimate.relative_error);
    assert_eq!(estimate(&out.input, &solve(&out.input)).relative_error, out.estimate.relative_error);
}
