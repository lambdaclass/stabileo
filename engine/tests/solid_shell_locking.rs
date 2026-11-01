//! Solid-shell (SHB8-ANS-EAS) locking and convergence benchmarks (issue #400).
//!
//! The solid shell keeps the full 3D constitutive law, so through-thickness Poisson
//! coupling makes bending stiffer than Kirchhoff/Mindlin theory unless the thickness
//! strain may vary linearly through the thickness. With the trilinear field alone
//! ε_ζζ is constant in ζ, the bending stresses carry a spurious σ_zz, and the plate
//! rigidity becomes E(1 − ν)/((1 + ν)(1 − 2ν))·t³/12 instead of E/(1 − ν²)·t³/12:
//! (1 − ν)²/(1 − 2ν) = 1.225 too stiff at ν = 0.3, a centre deflection of 0.816 of
//! Navier's however fine the mesh ("Poisson thickness locking"). These tests pin the
//! cure (one EAS thickness mode, see element/solid_shell.rs) against closed-form and
//! MacNeal–Harder references, with tolerances set by what each reference supports.
//!
//! References:
//! - Navier series (Timoshenko & Woinowsky-Krieger §30) for the simply supported plate,
//!   Kirchhoff; the Mindlin version adds the shear term D·α²/(κGt) per harmonic.
//! - MacNeal & Harder (1985), "A proposed standard set of problems to test finite
//!   element accuracy", FEA&D 1: straight cantilever, Scordelis–Lo, pinched cylinder,
//!   hemisphere with an 18° hole.
//! - Exact 3D elasticity for pure bending of a prismatic strip (St Venant).

#[path = "benchmarks/macneal_harder.rs"]
mod mh;
use dedaliano_engine::solver::{buckling, linear, modal};
use dedaliano_engine::types::*;
use std::collections::HashMap;
use std::f64::consts::PI;

// ==================== Model building ====================

fn support(node_id: usize, f: [bool; 3]) -> SolverSupport3D {
    SolverSupport3D {
        node_id, rx: f[0], ry: f[1], rz: f[2], rrx: false, rry: false, rrz: false,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
    }
}

fn empty_input() -> SolverInput3D {
    SolverInput3D {
        solver_options: None, nodes: HashMap::new(), materials: HashMap::new(), sections: HashMap::new(),
        elements: HashMap::new(), supports: HashMap::new(), loads: vec![], constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(),
        curved_shells: HashMap::new(), curved_beams: vec![], connectors: HashMap::new(),
        masses: Default::default(),
    }
}

/// A one-element-thick solid-shell mesh: nx × ny elements on the map
/// (u, v) ∈ [0,1]² → (mid-surface point, unit normal), faces at ±t/2 along the normal.
/// `bc(i, j, nx, ny)` restrains the translations of BOTH nodes of grid point (i, j).
struct Model {
    input: SolverInput3D,
    /// (bottom, top) node ids of grid point (i, j).
    grid: Vec<Vec<(usize, usize)>>,
}

fn solid_surface(
    nx: usize, ny: usize, t: f64, e_mpa: f64, nu: f64,
    map: &dyn Fn(f64, f64) -> ([f64; 3], [f64; 3]),
    bc: &dyn Fn(usize, usize, usize, usize) -> Option<[bool; 3]>,
) -> Model {
    let mut input = empty_input();
    input.materials.insert("1".into(), SolverMaterial { id: 1, e: e_mpa, nu });
    let mut grid = vec![vec![(0usize, 0usize); ny + 1]; nx + 1];
    let mut nid = 1;
    for i in 0..=nx {
        for j in 0..=ny {
            let (p, n) = map(i as f64 / nx as f64, j as f64 / ny as f64);
            for (k, s) in [-0.5, 0.5].into_iter().enumerate() {
                let id = nid + k;
                input.nodes.insert(id.to_string(), SolverNode3D { id, x: p[0] + s * t * n[0], y: p[1] + s * t * n[1], z: p[2] + s * t * n[2] });
            }
            grid[i][j] = (nid, nid + 1);
            nid += 2;
        }
    }
    let mut eid = 1;
    for i in 0..nx {
        for j in 0..ny {
            let c = [grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]];
            let nodes = [c[0].0, c[1].0, c[2].0, c[3].0, c[0].1, c[1].1, c[2].1, c[3].1];
            input.solid_shells.insert(eid.to_string(), SolverSolidShellElement { id: eid, nodes, material_id: 1 });
            eid += 1;
        }
    }
    let mut sid = 1;
    for i in 0..=nx {
        for j in 0..=ny {
            if let Some(f) = bc(i, j, nx, ny) {
                for n in [grid[i][j].0, grid[i][j].1] {
                    input.supports.insert(sid.to_string(), support(n, f));
                    sid += 1;
                }
            }
        }
    }
    Model { input, grid }
}

fn nodal(node_id: usize, f: [f64; 3]) -> SolverLoad3D {
    SolverLoad3D::Nodal(SolverNodalLoad3D { node_id, fx: f[0], fy: f[1], fz: f[2], mx: 0.0, my: 0.0, mz: 0.0, bw: None })
}

/// Point force at grid point (i, j), shared equally by its two face nodes.
fn point_load(m: &mut Model, i: usize, j: usize, f: [f64; 3]) {
    let (b, t) = m.grid[i][j];
    for id in [b, t] {
        m.input.loads.push(nodal(id, [0.5 * f[0], 0.5 * f[1], 0.5 * f[2]]));
    }
}

fn pressure_all(m: &mut Model, q: f64) {
    let ids: Vec<usize> = m.input.solid_shells.values().map(|s| s.id).collect();
    for id in ids {
        m.input.loads.push(SolverLoad3D::SolidShellPressure(SolverPressureLoad { element_id: id, pressure: q }));
    }
}

fn solve(m: &Model) -> AnalysisResults3D {
    linear::solve_3d(&m.input).expect("solve")
}

fn disp(r: &AnalysisResults3D, id: usize) -> [f64; 3] {
    let d = r.displacements.iter().find(|d| d.node_id == id).expect("node");
    [d.ux, d.uy, d.uz]
}

/// Mid-surface displacement at grid point (i, j): mean of the two face nodes.
fn mid(r: &AnalysisResults3D, m: &Model, i: usize, j: usize) -> [f64; 3] {
    let (a, b) = (disp(r, m.grid[i][j].0), disp(r, m.grid[i][j].1));
    [0.5 * (a[0] + b[0]), 0.5 * (a[1] + b[1]), 0.5 * (a[2] + b[2])]
}

/// Observed convergence order from errors on meshes h, h/2.
fn order(e_coarse: f64, e_fine: f64) -> f64 {
    (e_coarse / e_fine).log2()
}

// ==================== Plates ====================

const E_PLATE: f64 = 200_000.0; // MPa (kN/m² × 1e-3)
const NU: f64 = 0.3;

/// Square plate, side 1, uniform load q = 1 (downwards), simply supported on all edges.
/// `hard`: also restrain the edge-tangential displacement of both faces (hard support,
/// θ_s = 0, as in the Navier/Mindlin series); otherwise only w = 0 (soft support) plus
/// in-plane pins at two corners.
fn ss_plate(n: usize, t: f64, hard: bool) -> Model {
    let map = |u: f64, v: f64| ([u, v, 0.0], [0.0, 0.0, 1.0]);
    let bc = move |i: usize, j: usize, nx: usize, ny: usize| -> Option<[bool; 3]> {
        let (xe, ye) = (i == 0 || i == nx, j == 0 || j == ny);
        if !(xe || ye) {
            return None;
        }
        if hard {
            // Edge x = const: tangential is y; edge y = const: tangential is x.
            return Some([ye || (i == 0 && j == 0), xe, true]);
        }
        let pin = (i == 0 && j == 0, i == nx && j == 0);
        Some([pin.0, pin.0 || pin.1, true])
    };
    let mut m = solid_surface(n, n, t, E_PLATE, NU, &map, &bc);
    pressure_all(&mut m, 1.0);
    m
}

/// Navier centre deflection of the simply supported unit square plate under q = 1.
/// `kappa`: Some(κ) for Mindlin (hard support) with shear correction κ, None for Kirchhoff.
fn navier_centre(t: f64, kappa: Option<f64>) -> f64 {
    let e = E_PLATE * 1000.0;
    let d = e * t.powi(3) / (12.0 * (1.0 - NU * NU));
    let kgt = kappa.unwrap_or(1.0) * e / (2.0 * (1.0 + NU)) * t;
    let mut w = 0.0;
    for m in (1..600).step_by(2) {
        for n in (1..600).step_by(2) {
            let (mf, nf) = (m as f64, n as f64);
            let a2 = PI * PI * (mf * mf + nf * nf);
            let qmn = 16.0 / (PI * PI * mf * nf);
            let sign = if (m / 2 + n / 2) % 2 == 0 { 1.0 } else { -1.0 };
            let phi = if kappa.is_some() { 1.0 + d * a2 / kgt } else { 1.0 };
            w += sign * qmn / (d * a2 * a2) * phi;
        }
    }
    w
}

/// FE centre deflection of the n × n plate (mid-surface, mean of the faces).
fn plate_w(n: usize, t: f64, hard: bool) -> f64 {
    let m = ss_plate(n, t, hard);
    let r = solve(&m);
    -mid(&r, &m, n / 2, n / 2)[2]
}

/// Issue #400 reproduction: thin simply supported plate, t/a = 0.01 and 0.001, must
/// converge to the Kirchhoff (Navier) centre deflection, not stall at 0.80–0.82 (before the
/// EAS thickness mode: 0.7996, 0.8133, 0.8166, 0.8181 at t/a = 0.01 on 4…32 meshes).
/// Hard support: the Navier series' own boundary condition; the Mindlin − Kirchhoff
/// difference is O((t/a)²), 5e-4 at t/a = 0.01, below the tolerances.
#[test]
fn thin_plate_converges_to_kirchhoff() {
    // t/a = 0.001 stops at 16×16: finer one-layer meshes that thin are ill-conditioned enough
    // that the sparse Cholesky residual check falls back to dense LU (minutes per solve).
    for (t, meshes) in [(0.01, &[4, 8, 16, 32][..]), (0.001, &[4, 8, 16][..])] {
        let w_k = navier_centre(t, None);
        // The element's own limit: Mindlin with κ = 1 (see thick_plate_converges_to_mindlin),
        // 1 + 4e-4 of Kirchhoff at t/a = 0.01. Orders are measured against it.
        let w_lim = navier_centre(t, Some(1.0));
        let ws: Vec<f64> = meshes.iter().map(|&n| plate_w(n, t, true)).collect();
        let ratios: Vec<f64> = ws.iter().map(|w| w / w_k).collect();
        let errs: Vec<f64> = ws.iter().map(|w| (w / w_lim - 1.0).abs()).collect();
        let orders: Vec<f64> = errs.windows(2).map(|w| order(w[0], w[1])).collect();
        eprintln!("thin hard-SS plate t/a = {t}: w/w_Kirchhoff {ratios:.5?}, orders {orders:.2?}");
        let last = ratios.len() - 1;
        let tol = if meshes[last] >= 32 { 0.001 } else { 0.003 };
        assert!((ratios[last] - 1.0).abs() < tol, "t/a = {t}, {0}×{0}: w/w_Kirchhoff = {1:.5}", meshes[last], ratios[last]);
        // From below (no locking left to hide an overshoot), second order (bilinear field).
        assert!(ws.iter().all(|&w| w < w_lim), "t/a = {t}: overshoot {ratios:?}");
        assert!(orders.iter().all(|&p| p > 1.8), "t/a = {t}: observed orders {orders:?}");
    }
}

/// The issue's own configuration: soft simple support (w = 0 only). The 3D/Mindlin soft
/// support has an edge boundary layer that adds an O(t/a) flexibility the Kirchhoff plate
/// lacks, so the limit sits slightly above Navier at t/a = 0.01 and on it at 0.001.
#[test]
fn thin_plate_soft_support_matches_kirchhoff() {
    for (t, n, tol) in [(0.01, 32, 0.003), (0.001, 16, 0.003)] {
        let ratio = plate_w(n, t, false) / navier_centre(t, None);
        eprintln!("thin soft-SS plate t/a = {t}, {n}×{n}: w/w_Kirchhoff {ratio:.5}");
        assert!((ratio - 1.0).abs() < tol, "t/a = {t}, {n}×{n}: w/w_Kirchhoff = {ratio:.5}");
    }
}

/// Thick plates (t/a = 0.1, 0.2), hard simple support, against the Mindlin Navier series.
/// One solid-shell layer has a linear displacement through the thickness, so its transverse
/// shear strain is constant across it: it is a Mindlin plate with shear correction κ = 1,
/// and that is the limit it must converge to (to 0.3 %). Against κ = 5/6 (close to 3D
/// elasticity) it is stiffer by the shear-energy share: 0.8 % at t/a = 0.1, 2.9 % at 0.2 —
/// a property of one linear layer (stack layers through the thickness for thick parts),
/// asserted here so it cannot grow unnoticed.
#[test]
fn thick_plate_converges_to_mindlin() {
    for (t, gap) in [(0.1, 0.01), (0.2, 0.031)] {
        let ws: Vec<f64> = [8, 16, 32].iter().map(|&n| plate_w(n, t, true)).collect();
        let r1: Vec<f64> = ws.iter().map(|w| w / navier_centre(t, Some(1.0))).collect();
        let r56 = ws[2] / navier_centre(t, Some(5.0 / 6.0));
        eprintln!("thick hard-SS plate t/a = {t}: w/w_Mindlin(κ=1) {r1:.5?}, 32×32 w/w_Mindlin(κ=5/6) {r56:.5}, w/w_Kirchhoff {:.4}",
            ws[2] / navier_centre(t, None));
        assert!((r1[2] - 1.0).abs() < 0.003, "t/a = {t}, 32×32: w/w_Mindlin(κ=1) = {:.5}", r1[2]);
        assert!(r56 > 1.0 - gap && r56 < 1.0, "t/a = {t}: w/w_Mindlin(κ=5/6) = {r56:.5}");
    }
}

/// Pure bending of a thin strip with ν = 0.3 (end couple, one element through the
/// thickness): the 3D elasticity solution has ε_zz = −ν/(1 − ν)·ε_xx (plane strain) or
/// −ν·ε_xx (free lateral faces), linear in z. The trilinear element alone cannot carry it
/// and is too stiff by (1 − ν)²/(1 − 2ν) resp. ~1/(1 − ν²); with the EAS thickness mode
/// the tip deflection is exact for every t/L.
#[test]
fn pure_bending_strip_is_exact_with_poisson() {
    let (l, b, nx) = (1.0, 0.1, 8);
    for t in [0.1, 0.01, 0.001] {
        for plane_strain in [true, false] {
            let map = |u: f64, v: f64| ([u * l, (v - 0.5) * b, 0.0], [0.0, 0.0, 1.0]);
            let bc = move |i: usize, _j: usize, _nx: usize, _ny: usize| -> Option<[bool; 3]> {
                // Clamp x = 0 against x only (plus enough to stop rigid motion), so the
                // root section is free to contract — the St Venant end condition.
                let f = [i == 0, plane_strain, false];
                f.iter().any(|&x| x).then_some(f)
            };
            let mut m = solid_surface(nx, 1, t, E_PLATE, NU, &map, &bc);
            // Root, bottom face: w = 0 at y = ±b/2 (equal there by symmetry of the anticlastic
            // term) stops the rigid rotation about x and the translation along z; v = 0 at one
            // of them stops the translation along y. The top nodes stay free to change the
            // thickness and to contract laterally (v = ν·κ·y·z in the exact solution).
            for (j, fy) in [(0, true), (1, plane_strain)] {
                let id = m.grid[0][j].0;
                for s in m.input.supports.values_mut() {
                    if s.node_id == id {
                        *s = support(id, [true, fy, true]);
                    }
                }
            }
            // End couple M (per unit width 1): ±F on the tip face nodes, F·t = M·b.
            let mmt = 1e-6 * t.powi(2); // keep displacements small
            let f = mmt * b / t / 2.0;
            for j in 0..2 {
                let (bot, top) = m.grid[nx][j];
                m.input.loads.push(nodal(bot, [f, 0.0, 0.0]));
                m.input.loads.push(nodal(top, [-f, 0.0, 0.0]));
            }
            let r = solve(&m);
            let w_tip = 0.5 * (mid(&r, &m, nx, 0)[2] + mid(&r, &m, nx, 1)[2]);
            let e = E_PLATE * 1000.0;
            let ei = if plane_strain { e / (1.0 - NU * NU) } else { e } * t.powi(3) / 12.0;
            // M per unit width (mmt) with the bottom fibres stretched → w > 0 at the tip.
            let exact = mmt * l * l / (2.0 * ei);
            let ratio = w_tip / exact;
            eprintln!("pure bending t/L = {t}, plane strain {plane_strain}: w/w_exact = {ratio:.9}");
            // Exact up to round-off. The global stiffness of a one-layer solid shell has a
            // condition number ~ h·L³/t⁴ (thickness stretch E·h²/t against bending E·t³/L²),
            // ~1e11 at t/L = 1e-3, where the round-off reaches ~2e-4 (it was ~1.5e-5 before the
            // EAS mode, on a locked answer of 0.816).
            let tol = if t >= 0.01 { 1e-6 } else { 1e-3 };
            assert!((ratio - 1.0).abs() < tol, "t/L = {t}, plane strain {plane_strain}: w/w_exact = {ratio:.8}");
        }
    }
}

// ==================== Shells (MacNeal–Harder) ====================

/// Scordelis–Lo roof, one quarter: R = 25, L = 50, 40°, t = 0.25, E = 4.32e8, ν = 0, weight
/// 90 per unit area. Midspan free-edge vertical displacement, reference 0.3024 (MacNeal–Harder;
/// 0.3086 is the deep-shell value — the spread bounds what the reference supports).
fn scordelis(n: usize) -> f64 {
    let (r, half_l, th, t) = (25.0, 25.0, 40.0_f64.to_radians(), 0.25);
    let map = move |u: f64, v: f64| {
        let a = v * th;
        ([u * half_l, r * a.sin(), r * a.cos() - r], [0.0, a.sin(), a.cos()])
    };
    // i: along x (0 = midspan symmetry, n = diaphragm); j: around (0 = crown, n = free edge).
    let bc = |i: usize, j: usize, nx: usize, _ny: usize| -> Option<[bool; 3]> {
        let f = [i == 0, j == 0 || i == nx, i == nx];
        f.iter().any(|&b| b).then_some(f)
    };
    let mut m = solid_surface(n, n, t, 4.32e8 / 1000.0, 0.0, &map, &bc);
    let ids: Vec<usize> = m.input.solid_shells.values().map(|s| s.id).collect();
    for id in ids {
        // Force per unit area 90 = ρ/1000 · t · g with g = 1.
        m.input.loads.push(SolverLoad3D::SolidShellSelfWeight(SolverSolidShellSelfWeightLoad {
            element_id: id, density: 90.0 / t * 1000.0, gx: 0.0, gy: 0.0, gz: -1.0,
        }));
    }
    let r = solve(&m);
    -mid(&r, &m, 0, n)[2]
}

/// Pinched cylinder with rigid diaphragms, one eighth: R = 300, L = 600, t = 3, E = 3e6,
/// ν = 0.3, P = 1. Radial displacement under the load, reference 1.8248e-5.
fn pinched_cylinder(n: usize) -> f64 {
    let (r, half_l) = (300.0, 300.0);
    let map = move |u: f64, v: f64| {
        let th = v * PI / 2.0;
        ([u * half_l, r * th.cos(), r * th.sin()], [0.0, th.cos(), th.sin()])
    };
    // i = 0: midspan symmetry (ux = 0); i = n: diaphragm (uy = uz = 0);
    // j = 0: plane z = 0 (uz = 0); j = n: plane y = 0 (uy = 0).
    let bc = |i: usize, j: usize, nx: usize, ny: usize| -> Option<[bool; 3]> {
        let f = [i == 0, i == nx || j == ny, i == nx || j == 0];
        f.iter().any(|&b| b).then_some(f)
    };
    let mut m = solid_surface(n, n, 3.0, 3000.0, 0.3, &map, &bc);
    point_load(&mut m, 0, 0, [0.0, -0.25, 0.0]);
    let r = solve(&m);
    -mid(&r, &m, 0, 0)[1]
}

/// Hemispherical shell with an 18° hole, one quarter: R = 10, t = 0.04, E = 6.825e7, ν = 0.3,
/// ±2 radial point loads at the equator. Reference 0.094 (MacNeal–Harder; 0.0924 converged).
fn hemisphere(n: usize) -> f64 {
    let r = 10.0;
    let map = move |u: f64, v: f64| {
        let (phi, th) = (u * 72.0_f64.to_radians(), v * PI / 2.0);
        let nrm = [phi.cos() * th.cos(), phi.cos() * th.sin(), phi.sin()];
        ([r * nrm[0], r * nrm[1], r * nrm[2]], nrm)
    };
    // j = 0: plane y = 0 (uy = 0); j = n: plane x = 0 (ux = 0); one uz restraint.
    let bc = |i: usize, j: usize, nx: usize, ny: usize| -> Option<[bool; 3]> {
        let f = [j == ny, j == 0, i == nx && j == 0];
        f.iter().any(|&b| b).then_some(f)
    };
    let mut m = solid_surface(n, n, 0.04, 68250.0, 0.3, &map, &bc);
    // Each load lies on a symmetry plane: the quarter carries half of it.
    point_load(&mut m, 0, 0, [1.0, 0.0, 0.0]);
    point_load(&mut m, 0, n, [0.0, -1.0, 0.0]);
    let r = solve(&m);
    mid(&r, &m, 0, 0)[0]
}

#[test]
fn scordelis_lo_roof() {
    let v: Vec<f64> = [4, 8, 16].iter().map(|&n| scordelis(n) / mh::reference("scordelis")).collect();
    eprintln!("Scordelis–Lo w/0.3024: {v:.4?}");
    // Before the EAS modes: 0.9433, 0.9726, 0.9886. The reference itself is uncertain by
    // 0.3024 vs 0.3086 (2 %), so 1 % on the 16×16 mesh is what it supports.
    assert!((v[2] - 1.0).abs() < 0.01, "16×16: {:.4}", v[2]);
    assert!((v[1] - 1.0).abs() < 0.02, "8×8: {:.4}", v[1]);
}

#[test]
fn pinched_cylinder_with_diaphragms() {
    let v: Vec<f64> = [8, 16, 32].iter().map(|&n| pinched_cylinder(n) / mh::reference("pinchedCylinder")).collect();
    eprintln!("pinched cylinder w/1.8248e-5: {v:.4?}");
    // Before the EAS modes: 0.6729, 0.8249, 0.8731. Converges from below (point load:
    // the reference is the converged value of a singular field, ~1 % uncertain).
    assert!(v[0] < v[1] && v[1] < v[2], "not monotone: {v:?}");
    assert!(v[2] > 0.975 && v[2] < 1.01, "32×32: {:.4}", v[2]);
}

#[test]
fn hemisphere_with_hole() {
    let v: Vec<f64> = [8, 16, 32].iter().map(|&n| hemisphere(n) / mh::reference("hemisphere")).collect();
    eprintln!("hemisphere u/0.094: {v:.4?}");
    // Before the EAS modes: 0.9764, 0.9792, 0.9838. References 0.094 (MacNeal–Harder) and
    // 0.0924 (converged) bracket the answer: 0.983–1.0 of 0.094.
    for (k, n) in [(1, 16), (2, 32)] {
        assert!(v[k] > 0.975 && v[k] < 1.005, "{n}×{n}: {:.4}", v[k]);
    }
}

// ==================== MacNeal–Harder straight cantilever ====================

/// MacNeal–Harder straight cantilever: L = 6, width 0.2, t = 0.1, E = 1e7, ν = 0.3, 6 × 1
/// elements, unit tip shear. Shapes: regular, trapezoidal (interior edges alternately at ±45°),
/// parallelogram (all interior edges at 45°). Returns the tip displacement along the load,
/// `out_of_plane` = along the thickness (reference 0.4321), else across the width (0.1081).
fn mh_cantilever(shape: &str, out_of_plane: bool) -> f64 {
    let axis = if out_of_plane { "out" } else { "in" };
    let id = format!("solid-{shape}-{axis}");
    let c = mh::DATA["nativeOnly"].as_array().unwrap().iter().find(|c| c["id"] == id).unwrap();
    let input: SolverInput3D = serde_json::from_value(c["input"].clone()).unwrap();
    let r = linear::solve_3d(&input).expect("solve");
    let component = if out_of_plane { 2 } else { 1 };
    c["measurement"]["nodes"].as_array().unwrap().iter()
        .map(|id| disp(&r, id.as_u64().unwrap() as usize)[component]).sum::<f64>() / 4.0
}

/// Before → after the EAS modes (out-of-plane / in-plane):
///   regular       0.878 / 0.093  →  0.979 / 0.979
///   trapezoidal   0.864 / 0.026  →  0.960 / 0.047
///   parallelogram 0.877 / 0.032  →  0.976 / 0.624
/// In-plane bending of 0.2-wide elements locked through parasitic in-plane shear until the
/// membrane EAS-4 modes. The trapezoidal in-plane case stays locked: MacNeal (1987) showed no
/// 4-node (per layer) element that passes the patch test can be free of trapezoidal locking,
/// and every patch-test-passing 8-node hex in the MacNeal–Harder tables reports 0.02–0.07
/// there. It is asserted as a floor so it is visible, and solid shells for in-plane bending
/// need near-rectangular elements (the pre-solve Jacobian-ratio gate flags strong distortion).
#[test]
fn macneal_harder_straight_cantilever() {
    // (shape, out-of-plane floor, in-plane floor)
    for row in mh::DATA["solidCantilever"]["shapes"].as_array().unwrap() {
        let (shape, f_out, f_in) = (row[0].as_str().unwrap(), row[1].as_f64().unwrap(), row[2].as_f64().unwrap());
        let out = mh_cantilever(shape, true) / mh::DATA["solidCantilever"]["references"][0].as_f64().unwrap();
        let inp = mh_cantilever(shape, false) / mh::DATA["solidCantilever"]["references"][1].as_f64().unwrap();
        eprintln!("MH straight cantilever {shape}: out-of-plane {out:.4}, in-plane {inp:.4}");
        assert!(out > f_out && out < 1.01, "{shape} out-of-plane: {out:.4}");
        assert!(inp > f_in && inp < 1.01, "{shape} in-plane: {inp:.4}");
    }
}

// ==================== Modal and buckling with ν ≠ 0 ====================
// The EAS modes enter K, so every analysis built on K sees them. The analysis tests in
// solid_shell_analyses.rs use ν = 0, where the thickness mode is inactive; these two pin
// the Poisson-sensitive cases. Before the fix both were 1.225× too stiff in bending: the
// frequency √1.225 = 1.107 too high, the buckling load 1.225 too high (unconservative).

/// Fundamental frequency of the hard simply supported square plate, t/a = 0.01, ν = 0.3:
/// f₁₁ = (π/2)·(2/a²)·√(D/(ρt)) (Kirchhoff; Mindlin and rotary inertia lower it by < 0.1 %).
#[test]
fn modal_thin_plate_with_poisson() {
    let (t, n, rho) = (0.01, 16, 7850.0);
    let mut m = ss_plate(n, t, true);
    m.input.loads.clear();
    let dens: HashMap<String, f64> = [("1".to_string(), rho)].into_iter().collect();
    let res = modal::solve_modal_3d(&m.input, &dens, 3).expect("modal");
    let d = E_PLATE * 1000.0 * t.powi(3) / (12.0 * (1.0 - NU * NU));
    let f11 = PI / 2.0 * 2.0 * (d / (rho / 1000.0 * t)).sqrt();
    let ratio = res.modes[0].frequency / f11;
    eprintln!("SS plate f1 / f11_Kirchhoff = {ratio:.5}");
    // Bilinear mass and stiffness: converges from above at second order; 16×16 ≈ 0.4 % high.
    assert!(ratio > 0.999 && ratio < 1.01, "f1/f11 = {ratio:.5}");
}

/// Uniaxially compressed simply supported square plate (unloaded edges free in-plane),
/// t/a = 0.01, ν = 0.3: N_cr = 4π²D/a² (Timoshenko & Gere §9.2).
#[test]
fn buckling_thin_plate_with_poisson() {
    let r: Vec<f64> = [8, 16, 32].iter().map(|&n| buckle(n, false)).collect();
    eprintln!("SS plate buckling λ/N_cr, 8/16/32: {r:.4?}");
    // Before the EAS mode: 1.139 / 1.172 / 1.194 (unconservative). Now 0.939 / 0.961 / 0.977:
    // the ratio to the old values is 1/1.225 throughout, so the slow (≈ first-order),
    // from-below convergence is the geometric-stiffness/prestress path's, not the EAS's — the
    // same with hard supports (EqualDOF top = bottom tangential): 0.940 / 0.963 / 0.979.
    // From below is the conservative side for a buckling load; asserted so it cannot drift.
    assert!(r[0] < r[1] && r[1] < r[2], "not monotone: {r:?}");
    assert!(r[2] > 0.97 && r[2] < 1.0, "32×32: λ/N_cr = {:.4}", r[2]);
}
/// λ/N_cr on an n × n mesh; `hard` ties the edge-tangential displacement of the two faces
/// (hard support) instead of leaving it free (soft).
fn buckle(n: usize, hard: bool) -> f64 {
    let t = 0.01;
    let map = |u: f64, v: f64| ([u, v, 0.0], [0.0, 0.0, 1.0]);
    let bc = |i: usize, j: usize, nx: usize, ny: usize| -> Option<[bool; 3]> {
        (i == 0 || j == 0 || i == nx || j == ny).then_some([false, false, true])
    };
    let mut m = solid_surface(n, n, t, E_PLATE, NU, &map, &bc);
    // In-plane rigid motion: bottom face, ux and uy at (0, 0), uy at (n, 0).
    for (id, f) in [(m.grid[0][0].0, [true, true, true]), (m.grid[n][0].0, [false, true, true])] {
        for s in m.input.supports.values_mut() {
            if s.node_id == id {
                *s = support(id, f);
            }
        }
    }
    if hard {
        for i in 0..=n {
            for j in 0..=n {
                let mut dofs = vec![];
                if j == 0 || j == n { dofs.push(0); }
                if i == 0 || i == n { dofs.push(1); }
                if !dofs.is_empty() {
                    let (b, tp) = m.grid[i][j];
                    m.input.constraints.push(Constraint::EqualDOF(EqualDOFConstraint { master_node: b, slave_node: tp, dofs }));
                }
            }
        }
    }
    // Unit compressive edge force per length (N = 1) on x = 0 and x = a, consistent nodal
    // forces (half at the corners), shared by the two faces.
    for j in 0..=n {
        let share = if j == 0 || j == n { 0.5 } else { 1.0 } / n as f64;
        point_load(&mut m, 0, j, [share, 0.0, 0.0]);
        point_load(&mut m, n, j, [-share, 0.0, 0.0]);
    }
    let res = buckling::solve_buckling_3d(&m.input, 2).expect("buckling");
    let d = E_PLATE * 1000.0 * t.powi(3) / (12.0 * (1.0 - NU * NU));
    let ncr = 4.0 * PI * PI * d;
    let ratio = res.modes[0].load_factor / ncr;
    ratio
}
