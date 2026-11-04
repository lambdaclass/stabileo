//! Derivation checks for the special line elements (cables, curved beams,
//! connectors, fiber beam-columns). Companion of docs/solver/special-elements.md:
//! every SP-n discrepancy there has a test here. FIXED items are regression
//! tests that failed before the fix; OPEN items are `#[ignore]`d reproductions.

use crate::common;

use common::{make_3d_beam, make_3d_input, make_beam};
use dedaliano_engine::element::fiber_beam::*;
use dedaliano_engine::element::{
    cable_length_catenary, catenary_ordinate, connector_stiffness_3d, ernst_equivalent_modulus,
    ernst_tangent_modulus, expand_curved_beam, frame_local_stiffness_2d, frame_local_stiffness_3d,
    irvine_parameter, parabolic_ordinate, Hinge3D,
};
use dedaliano_engine::solver::cable;
use dedaliano_engine::solver::fiber_nonlinear::*;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ───────────────────────────── helpers ─────────────────────────────────────

fn rel(a: f64, b: f64) -> f64 {
    (a - b).abs() / b.abs().max(1e-300)
}

fn states(n_ip: usize, n_fib: usize) -> Vec<SectionState> {
    (0..n_ip).map(|_| SectionState::new(n_fib)).collect()
}

/// Two elastic fibers at transverse coordinate ±c (first one at +c), areas a1, a2.
fn two_fiber_section(e: f64, c: f64, a1: f64, a2: f64, along_z: bool) -> FiberSectionDef {
    let f = |s: f64, area: f64| {
        if along_z {
            Fiber { y: 0.0, z: s, area, material_idx: 0 }
        } else {
            Fiber { y: s, z: 0.0, area, material_idx: 0 }
        }
    };
    FiberSectionDef { fibers: vec![f(c, a1), f(-c, a2)], materials: vec![FiberMaterial::Elastic { e }] }
}

/// Four elastic fibers: the two of `two_fiber_section` along the chosen axis,
/// each split in half at ±0.05 on the other axis, so the section has bending
/// stiffness about both axes (a 3D model needs it).
fn four_fiber_section(e: f64, c: f64, a1: f64, a2: f64, along_z: bool) -> FiberSectionDef {
    let mut fibers = Vec::new();
    for (s, area) in [(c, a1), (-c, a2)] {
        for o in [0.05, -0.05] {
            let (y, z) = if along_z { (o, s) } else { (s, o) };
            fibers.push(Fiber { y, z, area: area / 2.0, material_idx: 0 });
        }
    }
    FiberSectionDef { fibers, materials: vec![FiberMaterial::Elastic { e }] }
}

/// 2D cantilever along +x, fixed at node 0, one fiber element 0–1.
fn fiber_cantilever_2d(
    l: f64,
    section: FiberSectionDef,
    fx: f64,
    fz: f64,
    n_ip: usize,
    n_inc: usize,
    tol: f64,
) -> FiberNonlinearInput {
    let mut nodes = HashMap::new();
    nodes.insert("0".into(), SolverNode { id: 0, x: 0.0, z: 0.0 });
    nodes.insert("1".into(), SolverNode { id: 1, x: l, z: 0.0 });
    let mut materials = HashMap::new();
    materials.insert("1".into(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".into(), SolverSection { id: 1, a: 0.08, iz: 1e-3, as_y: None });
    let mut elements = HashMap::new();
    elements.insert("1".into(), SolverElement {
        id: 1, elem_type: "frame".into(), node_i: 0, node_j: 1, material_id: 1, section_id: 1,
        hinge_start: false, hinge_end: false,
    });
    let mut supports = HashMap::new();
    supports.insert("0".into(), SolverSupport {
        id: 0, node_id: 0, support_type: "fixed".into(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    let solver = SolverInput {
        solver_options: None, nodes, materials, sections, elements, supports,
        loads: vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 1, fx, fz, my: 0.0 })],
        constraints: vec![], connectors: HashMap::new(),
        masses: Default::default(),
    };
    let mut fiber_sections = HashMap::new();
    fiber_sections.insert("1".into(), section);
    FiberNonlinearInput {
        solver, fiber_sections, n_integration_points: n_ip, max_iter: 100, tolerance: tol,
        n_increments: n_inc, modified_nr: false,
    }
}

fn fiber_cantilever_3d(l: f64, section: FiberSectionDef, load: SolverNodalLoad3D) -> FiberNonlinearInput3D {
    let solver = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, l, 0.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true; 6])],
        vec![SolverLoad3D::Nodal(load)],
    );
    let mut fiber_sections = HashMap::new();
    fiber_sections.insert("1".into(), section);
    FiberNonlinearInput3D {
        solver, fiber_sections, n_integration_points: 5, max_iter: 50, tolerance: 1e-12,
        n_increments: 1, modified_nr: false,
    }
}

// ═══════════════════════════ FIBER BEAM-COLUMN ═════════════════════════════

/// Linear range: an elastic fiber section, integrated with 3, 4 or 5
/// Gauss-Lobatto points, reproduces the Euler-Bernoulli frame stiffness exactly,
/// with EA = Σ E·A_i and EI = Σ E·A_i·y_i² of the fiber discretization.
#[test]
fn fiber_2d_elastic_matches_frame_stiffness() {
    let (b, h, e, l) = (0.3, 0.6, 30_000.0, 4.0);
    let sec = rectangular_fiber_section(b, h, 12, FiberMaterial::Elastic { e });
    let ea: f64 = sec.fibers.iter().map(|f| f.area).sum::<f64>() * e * 1000.0;
    let ei: f64 = sec.fibers.iter().map(|f| f.area * f.y * f.y).sum::<f64>() * e * 1000.0;
    let kf = frame_local_stiffness_2d(1.0, ea, ei, l, false, false, 0.0);
    for n_ip in [3, 4, 5] {
        let mut st = states(n_ip, sec.fibers.len());
        let (_, k) = fiber_element_response_2d(&[0.0; 6], l, &sec, &mut st, n_ip);
        for i in 0..36 {
            assert!((k[i] - kf[i]).abs() <= 1e-9 * kf[i].abs().max(ei / l.powi(3)), "n_ip {n_ip}: K[{i}] {} vs {}", k[i], kf[i]);
        }
    }
}

/// 3D twin, doubly-symmetric fiber grid: matches frame_local_stiffness_3d with
/// Iy = Σ A z², Iz = Σ A y² and the elastic torsion G·J/L.
#[test]
fn fiber_3d_elastic_matches_frame_stiffness() {
    let (b, h, e, l, nu, j) = (0.3, 0.5, 30_000.0, 3.0, 0.2, 2e-3);
    let mut fibers = Vec::new();
    let (ny, nz) = (6, 10);
    for iy in 0..ny {
        for iz in 0..nz {
            let y = -b / 2.0 + b / ny as f64 * (iy as f64 + 0.5);
            let z = -h / 2.0 + h / nz as f64 * (iz as f64 + 0.5);
            fibers.push(Fiber { y, z, area: b * h / (ny * nz) as f64, material_idx: 0 });
        }
    }
    let sec = FiberSectionDef { fibers, materials: vec![FiberMaterial::Elastic { e }] };
    let ek = e * 1000.0;
    let a: f64 = sec.fibers.iter().map(|f| f.area).sum();
    let iy: f64 = sec.fibers.iter().map(|f| f.area * f.z * f.z).sum();
    let iz: f64 = sec.fibers.iter().map(|f| f.area * f.y * f.y).sum();
    let g = ek / (2.0 * (1.0 + nu));
    let hinge = Hinge3D { release_my_start: false, release_mz_start: false, release_t_start: false, release_my_end: false, release_mz_end: false, release_t_end: false };
    let kf = frame_local_stiffness_3d(ek, a, iy, iz, j, l, g, hinge, 0.0, 0.0);
    let mut st = states(5, sec.fibers.len());
    let (_, k) = fiber_element_response_3d(&[0.0; 12], l, &sec, &mut st, 5, g * j);
    let scale = kf.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
    for i in 0..144 {
        assert!((k[i] - kf[i]).abs() <= 1e-10 * scale, "K[{i}] {} vs {}", k[i], kf[i]);
    }
}

/// SP-1 (FIXED). 3D fiber kinematics. With θy = −dw/dx (the frame convention),
/// the fiber strain is ε = ε₀ − z·w'' = ε₀ + z·θy'. The B row for κy was +w''
/// (θy coefficients negated, w coefficients not), so the strain field was
/// mirrored in z. Invisible for z-symmetric sections; for an eccentric section
/// the axial-bending coupling has the wrong sign. Uniform stretch δ of an
/// element whose fibers are off-centre in z: the end moments must be the axial
/// force times its eccentricity, My_j = +N·z̄ (r × F with r = z̄·ez, F = N·ex).
#[test]
fn fiber_3d_eccentric_z_section_end_moments() {
    let (e, c, a1, a2, l, d) = (200_000.0, 0.1, 3e-3, 1e-3, 2.0, 1e-4);
    let sec = two_fiber_section(e, c, a1, a2, true);
    let mut st = states(3, 2);
    let mut u = [0.0; 12];
    u[6] = d;
    let (f, _) = fiber_element_response_3d(&u, l, &sec, &mut st, 3, 0.0);
    let n = e * 1000.0 * (a1 + a2) * d / l;
    let zbar = c * (a1 - a2) / (a1 + a2);
    assert!(rel(f[6], n) < 1e-12, "N {} vs {n}", f[6]);
    assert!(rel(f[10], n * zbar) < 1e-9, "My_j {} vs +N·z̄ = {}", f[10], n * zbar);
    assert!(rel(f[4], -n * zbar) < 1e-9, "My_i {} vs −N·z̄ = {}", f[4], -n * zbar);
}

/// The y-direction of the same element was already right: Mz_j = −N·ȳ.
#[test]
fn fiber_3d_eccentric_y_section_end_moments() {
    let (e, c, a1, a2, l, d) = (200_000.0, 0.1, 3e-3, 1e-3, 2.0, 1e-4);
    let sec = two_fiber_section(e, c, a1, a2, false);
    let mut st = states(3, 2);
    let mut u = [0.0; 12];
    u[6] = d;
    let (f, _) = fiber_element_response_3d(&u, l, &sec, &mut st, 3, 0.0);
    let n = e * 1000.0 * (a1 + a2) * d / l;
    let ybar = c * (a1 - a2) / (a1 + a2);
    assert!(rel(f[11], -n * ybar) < 1e-9, "Mz_j {} vs −N·ȳ = {}", f[11], -n * ybar);
}

/// Exact solution of a cantilever with two fibers at ±c (areas a1 at +c, a2 at
/// −c) under axial tension P on the reference axis: ε₀ = P(a1+a2)/(4E·a1·a2),
/// curvature κ = (a1−a2)ε₀/(c(a1+a2)) toward the stiffer fibre, constant along
/// the member; tip transverse displacement κL²/2 (toward +c), tip ux = ε₀L.
fn eccentric_tension_exact(e_kn: f64, c: f64, a1: f64, a2: f64, p: f64, l: f64) -> (f64, f64) {
    let eps0 = p * (a1 + a2) / (4.0 * e_kn * a1 * a2);
    let kappa = (a1 - a2) * eps0 / (c * (a1 + a2));
    (eps0 * l, kappa * l * l / 2.0)
}

/// SP-1 (FIXED), solver level, 3D: the eccentric cantilever bends toward the
/// stiffer fibres at +z (tip uz > 0). Before the fix it bent the other way.
#[test]
fn fiber_3d_eccentric_tension_cantilever_bends_toward_stiff_side() {
    let (e, c, a1, a2, l, p) = (200_000.0, 0.1, 3e-3, 1e-3, 2.0, 100.0);
    let (ux, uz) = eccentric_tension_exact(e * 1000.0, c, a1, a2, p, l);
    let input = fiber_cantilever_3d(l, four_fiber_section(e, c, a1, a2, true),
        SolverNodalLoad3D { node_id: 2, fx: p, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None });
    let r = solve_fiber_nonlinear_3d(&input).unwrap();
    assert!(r.converged);
    let d = r.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(rel(d.ux, ux) < 1e-6, "ux {} vs {ux}", d.ux);
    assert!(rel(d.uz, uz) < 1e-6, "uz {} vs {uz} (toward the stiff +z fibres)", d.uz);
    // Same along y (always right): tip uy toward +y.
    let input = fiber_cantilever_3d(l, four_fiber_section(e, c, a1, a2, false),
        SolverNodalLoad3D { node_id: 2, fx: p, fy: 0.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None });
    let r = solve_fiber_nonlinear_3d(&input).unwrap();
    let d = r.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!(rel(d.uy, uz) < 1e-6, "uy {} vs {uz}", d.uy);
}

/// SP-2 (FIXED). 2D fiber kinematics. The 2D element bends in its local x–y
/// plane, v along local y (global +z for a member along +x) and θ = dv/dx. The
/// fiber strain is ε = ε₀ − y·v'' (y measured along local y, as the 3D element
/// measures y). The B row used κ = +v'' with ε = ε₀ + κ·y: mirrored in y.
/// End moment of a uniformly stretched eccentric element: M_j = −N·ȳ.
#[test]
fn fiber_2d_eccentric_section_end_moment() {
    let (e, c, a1, a2, l, d) = (200_000.0, 0.1, 3e-3, 1e-3, 2.0, 1e-4);
    let sec = two_fiber_section(e, c, a1, a2, false);
    let mut st = states(3, 2);
    let (f, _) = fiber_element_response_2d(&[0.0, 0.0, 0.0, d, 0.0, 0.0], l, &sec, &mut st, 3);
    let n = e * 1000.0 * (a1 + a2) * d / l;
    let ybar = c * (a1 - a2) / (a1 + a2);
    assert!(rel(f[5], -n * ybar) < 1e-9, "M_j {} vs −N·ȳ = {}", f[5], -n * ybar);
    assert!(rel(f[2], n * ybar) < 1e-9, "M_i {} vs +N·ȳ = {}", f[2], n * ybar);
}

/// SP-2 (FIXED), solver level: a 2D cantilever with its stiffer fibres on top
/// (+y = +z) under axial tension bends upward (tip uz > 0).
#[test]
fn fiber_2d_eccentric_tension_cantilever_bends_toward_stiff_side() {
    let (e, c, a1, a2, l, p) = (200_000.0, 0.1, 3e-3, 1e-3, 2.0, 100.0);
    let (ux, uz) = eccentric_tension_exact(e * 1000.0, c, a1, a2, p, l);
    let input = fiber_cantilever_2d(l, two_fiber_section(e, c, a1, a2, false), p, 0.0, 3, 1, 1e-12);
    let r = solve_fiber_nonlinear_2d(&input).unwrap();
    assert!(r.converged);
    let d = r.results.displacements.iter().find(|d| d.node_id == 1).unwrap();
    assert!(rel(d.ux, ux) < 1e-6, "ux {} vs {ux}", d.ux);
    assert!(rel(d.uz, uz) < 1e-6, "uz {} vs {uz} (toward the stiff top fibres)", d.uz);
}

/// SP-2 consequence: a cantilever under a downward tip load hogs, so at the
/// support the top fibre (+y) is in tension and the bottom one compressed.
/// With the mirrored kinematics it was the other way round, which for a
/// singly reinforced or otherwise y-asymmetric section is a different member.
#[test]
fn fiber_2d_hogging_puts_top_fibre_in_tension() {
    // Cantilever, downward tip load: hogging moment, top (+y) fibre in tension.
    let (e, l) = (200_000.0, 2.0);
    let sec = FiberSectionDef {
        fibers: vec![
            Fiber { y: 0.1, z: 0.0, area: 1e-3, material_idx: 0 },
            Fiber { y: -0.1, z: 0.0, area: 1e-3, material_idx: 0 },
        ],
        materials: vec![FiberMaterial::Elastic { e }],
    };
    let mut st = states(3, 2);
    // Cantilever tip deflection shape under tip load P downward: v(x) = −P x²(3L − x)/(6EI);
    // nodal values: v2 = −PL³/(3EI), θ2 = −PL²/(2EI). Use any positive scale.
    let s = 1e-4;
    let u = [0.0, 0.0, 0.0, 0.0, -s * l * l * l / 3.0, -s * l * l / 2.0];
    let _ = fiber_element_response_2d(&u, l, &sec, &mut st, 3);
    // Integration point 0 is the support section (x = 0).
    let top = st[0].fiber_states[0].stress;
    let bottom = st[0].fiber_states[1].stress;
    assert!(top > 0.0 && bottom < 0.0, "hogging at the support: top {top} must be tension, bottom {bottom} compression");
}

/// SP-3 (FIXED). Bilinear steel: `hardening_ratio` is documented as E_h/E, the
/// post-yield slope over E. The return mapping used the plastic modulus H = αE,
/// whose elasto-plastic slope is E·H/(E+H) = αE/(1+α): 9 % soft at α = 0.1.
#[test]
fn steel_bilinear_post_yield_slope_is_alpha_e() {
    let (e, fy, alpha) = (200_000.0, 250.0, 0.1);
    let mat = FiberMaterial::SteelBilinear { e, fy, hardening_ratio: alpha };
    let eps_y = fy / e;
    for eps in [2.0 * eps_y, 5.0 * eps_y, 20.0 * eps_y] {
        let mut st = FiberMaterialState::new();
        let (s, t) = material_response(&mat, eps, &mut st);
        let expected = fy + alpha * e * (eps - eps_y);
        assert!(rel(s, expected) < 1e-12, "σ({eps}) = {s}, bilinear {expected}");
        assert!(rel(t, alpha * e) < 1e-12, "tangent {t} vs αE = {}", alpha * e);
    }
    // Monotonic path in many steps gives the same stress (path independence on the hardening branch).
    let mut st = FiberMaterialState::new();
    let mut s = 0.0;
    for k in 1..=100 {
        s = material_response(&mat, 10.0 * eps_y * k as f64 / 100.0, &mut st).0;
    }
    assert!(rel(s, fy + alpha * e * 9.0 * eps_y) < 1e-12, "stepped σ {s}");
    // Elastic unloading from the hardening branch with slope E.
    let (s2, t2) = material_response(&mat, 9.0 * eps_y, &mut st);
    assert!(rel(s - s2, e * eps_y) < 1e-12 && t2 == e, "unloading {s} → {s2}");
}

/// SP-4 (FIXED). Gauss-Lobatto rules: the solver accepts 3–7 points but the
/// rule table stopped at 5 and silently returned 3 points for 6 and 7. An
/// n-point Lobatto rule integrates polynomials of degree 2n − 3 exactly.
#[test]
fn gauss_lobatto_rules_up_to_seven_points() {
    let l = 3.0;
    for n in 2..=7 {
        let pts = gauss_lobatto_points(n, l);
        assert_eq!(pts.len(), n, "{n}-point rule returned {} points", pts.len());
        assert!(pts[0].0.abs() < 1e-15 && (pts[n - 1].0 - l).abs() < 1e-14);
        for deg in 0..=(2 * n - 3) {
            let q: f64 = pts.iter().map(|&(x, w)| w * x.powi(deg as i32)).sum();
            let exact = l.powi(deg as i32 + 1) / (deg as f64 + 1.0);
            assert!(rel(q, exact) < 1e-13, "{n} points, degree {deg}: {q} vs {exact}");
        }
    }
}

/// SP-5 (FIXED). Two Lobatto points (the end sections only) integrate the
/// quadratic κ² of the cubic element with the trapezoidal rule: even for an
/// elastic section the stiffness is wrong (not the frame stiffness). The solver
/// clamped n to [2, 7]; it now refuses anything outside [3, 7] by name.
#[test]
fn two_point_lobatto_is_refused() {
    // The element-level evidence: n = 2 is not the frame stiffness.
    let (e, l) = (200_000.0, 2.0);
    let sec = rectangular_fiber_section(0.2, 0.4, 10, FiberMaterial::Elastic { e });
    let ei: f64 = sec.fibers.iter().map(|f| f.area * f.y * f.y).sum::<f64>() * e * 1000.0;
    let mut st = states(2, sec.fibers.len());
    let (_, k) = fiber_element_response_2d(&[0.0; 6], l, &sec, &mut st, 2);
    let k22 = 4.0 * ei / l;
    assert!(rel(k[2 * 6 + 2], k22) > 0.1, "2-point K_θθ {} vs 4EI/L {k22}", k[2 * 6 + 2]);
    // The solvers refuse 2 (and 8) instead of running an under-integrated element.
    for n_ip in [0, 1, 2, 8] {
        let input = fiber_cantilever_2d(l, sec.clone(), 0.0, -10.0, n_ip, 1, 1e-10);
        let err = solve_fiber_nonlinear_2d(&input).unwrap_err();
        assert!(err.contains("integration points"), "{err}");
        let input = fiber_cantilever_3d(l, sec.clone(),
            SolverNodalLoad3D { node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None });
        let mut input = input;
        input.n_integration_points = n_ip;
        let err = solve_fiber_nonlinear_3d(&input).unwrap_err();
        assert!(err.contains("integration points"), "{err}");
    }
}

/// SP-6 (FIXED). Element state determination must start every Newton iteration
/// from the last CONVERGED fiber state. The solver updated the fiber history
/// (plastic strain, back stress, cracking) in place at every trial iterate, so
/// an iterate that overshoots and comes back leaves spurious plastic strain.
/// Newton on a softening (concave) response overshoots on its second iterate.
/// For a statically determinate cantilever under a monotonically increasing tip
/// load every fiber strain grows monotonically, so the converged state is
/// path-independent: one load step and 50 must agree.
#[test]
fn fiber_state_is_committed_only_at_convergence() {
    let (l, p) = (3.0, -180.0); // M = 540 kN·m on a 0.2×0.4 steel section: My = 1333, Mp = 2000 → partial yield
    let sec = rectangular_fiber_section(0.2, 0.4, 40,
        FiberMaterial::SteelBilinear { e: 200_000.0, fy: 250.0, hardening_ratio: 0.02 });
    let run = |n_inc: usize| {
        let mut input = fiber_cantilever_2d(l, sec.clone(), 0.0, p * 10.0, 5, n_inc, 1e-12);
        input.max_iter = 200;
        let r = solve_fiber_nonlinear_2d(&input).unwrap();
        assert!(r.converged, "{n_inc} increments did not converge");
        assert!(r.fiber_status.iter().any(|s| s.yielded), "the load must yield the section");
        r.results.displacements.iter().find(|d| d.node_id == 1).unwrap().uz
    };
    let one = run(1);
    let many = run(50);
    assert!(rel(one, many) < 1e-6, "1 increment uz = {one}, 50 increments uz = {many}");
}

/// SP-7 (FIXED). The fiber solvers reported `element_forces` from the ELASTIC
/// frame stiffness (compute_internal_forces_2d/3d: K_elastic·u with the
/// SolverSection's A and Iz), not from the fiber section resultants. Once the
/// section yields, the reported moments violated statics (here 145 361 kN·m
/// for a support moment of 5 400). Cantilever: the support moment is P·L and
/// the shear P whatever the material does.
#[test]
fn fiber_solver_element_forces_satisfy_statics_after_yield() {
    let (l, p) = (3.0, -1800.0);
    let sec = rectangular_fiber_section(0.2, 0.4, 40,
        FiberMaterial::SteelBilinear { e: 200_000.0, fy: 250.0, hardening_ratio: 0.02 });
    let mut input = fiber_cantilever_2d(l, sec, 0.0, p, 5, 20, 1e-10);
    input.solver.sections.get_mut("1").unwrap().a = 0.08;
    input.solver.sections.get_mut("1").unwrap().iz = 0.2 * 0.4f64.powi(3) / 12.0;
    let r = solve_fiber_nonlinear_2d(&input).unwrap();
    assert!(r.converged);
    assert!(r.fiber_status.iter().any(|s| s.yielded));
    let ef = &r.results.element_forces[0];
    assert!(rel(ef.m_start.abs(), p.abs() * l) < 1e-6, "support moment {} vs statics P·L = {}", ef.m_start, p.abs() * l);
    assert!(ef.m_end.abs() < 1e-6 * p.abs() * l, "tip moment {}", ef.m_end);
    assert!(rel(ef.v_start.abs(), p.abs()) < 1e-6 && rel(ef.v_end.abs(), p.abs()) < 1e-6, "shear {} {}", ef.v_start, ef.v_end);
    assert!(ef.n_start.abs() < 1e-6 * p.abs(), "axial {}", ef.n_start);
}

/// SP-7 (FIXED), 3D: a yielded fiber cantilever along X under a tip load in
/// −Z reports |My(0)| = P·L, |Vz| = P.
#[test]
fn fiber_solver_3d_element_forces_satisfy_statics_after_yield() {
    let (l, p) = (3.0, 600.0);
    let (b, h, n) = (0.2, 0.4, 20);
    let mut fibers = Vec::new();
    for iy in 0..4 {
        for iz in 0..n {
            let y = -b / 2.0 + b / 4.0 * (iy as f64 + 0.5);
            let z = -h / 2.0 + h / n as f64 * (iz as f64 + 0.5);
            fibers.push(Fiber { y, z, area: b * h / (4 * n) as f64, material_idx: 0 });
        }
    }
    let sec = FiberSectionDef { fibers, materials: vec![FiberMaterial::SteelBilinear { e: 200_000.0, fy: 250.0, hardening_ratio: 0.02 }] };
    let mut input = fiber_cantilever_3d(l, sec,
        SolverNodalLoad3D { node_id: 2, fx: 0.0, fy: 0.0, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None });
    input.n_increments = 20;
    input.tolerance = 1e-10;
    input.max_iter = 100;
    let r = solve_fiber_nonlinear_3d(&input).unwrap();
    assert!(r.converged);
    assert!(r.fiber_status.iter().any(|s| s.yielded), "the load must yield the section");
    let ef = &r.results.element_forces[0];
    assert!(rel(ef.my_start.abs(), p * l) < 1e-6, "support My {} vs P·L = {}", ef.my_start, p * l);
    assert!(ef.my_end.abs() < 1e-6 * p * l, "tip My {}", ef.my_end);
    assert!(rel(ef.vz_start.abs(), p) < 1e-6, "Vz {}", ef.vz_start);
    assert!(ef.mz_start.abs() < 1e-6 * p * l && ef.n_start.abs() < 1e-6 * p, "Mz {} N {}", ef.mz_start, ef.n_start);
}

/// SP-18 (OPEN). The fiber solvers return an empty `reactions` list.
#[test]
#[ignore = "open question SP-18: fiber solvers return no reactions"]
fn fiber_solver_reports_reactions() {
    let sec = rectangular_fiber_section(0.2, 0.4, 10, FiberMaterial::Elastic { e: 200_000.0 });
    let r = solve_fiber_nonlinear_2d(&fiber_cantilever_2d(3.0, sec, 0.0, -10.0, 5, 1, 1e-10)).unwrap();
    assert!(!r.results.reactions.is_empty(), "no reactions reported");
}

/// SP-8 (DOCUMENTED-CHOICE, pinned). Hognestad concrete has no unloading
/// branch: in compression it is nonlinear-elastic (a strain that returns gives
/// back the stress of the envelope), crushing beyond ε_cu is not remembered,
/// only cracking is. Pinned here so a change is deliberate.
#[test]
fn concrete_hognestad_is_history_free_in_compression() {
    let mat = FiberMaterial::ConcreteHognestad { fc: 30.0, eps_c0: 0.002, eps_cu: 0.004, ft: 3.0 };
    let mut st = FiberMaterialState::new();
    let (s1, _) = material_response(&mat, -0.001, &mut st);
    let _ = material_response(&mat, -0.005, &mut st); // crushed
    let (s2, _) = material_response(&mat, -0.001, &mut st);
    assert_eq!(s1, s2, "envelope stress returns: {s1} vs {s2}");
    assert!((s1 + 30.0 * (2.0 * 0.5 - 0.25)).abs() < 1e-12);
    // Cracking is remembered.
    let _ = material_response(&mat, 1e-3, &mut st);
    let (s3, _) = material_response(&mat, 1e-5, &mut st);
    assert_eq!(s3, 0.0, "a cracked fibre stays cracked");
}

// ═══════════════════════════════ CABLES ════════════════════════════════════

/// SP-9 (FIXED). Irvine's λ² = (wL/H)²·L/(H·L_e/EA) is dimensionless. The
/// helper multiplied by an extra L (λ² = (wL/H)²·EA·L/(H·L_e/L)), so its value
/// changed with the length unit. Same cable in m and in mm.
#[test]
fn irvine_parameter_is_dimensionless() {
    let (w, l, h, e, a): (f64, f64, f64, f64, f64) = (1.0, 100.0, 250.0, 160e6, 5e-3); // kN/m, m, kN, kN/m², m²
    let d = w * l * l / (8.0 * h);
    let le = l * (1.0 + 8.0 * (d / l).powi(2));
    let expected = (w * l / h).powi(2) * l / (h * le / (e * a));
    let lam = irvine_parameter(w, l, h, e, a);
    assert!(rel(lam, expected) < 1e-12, "λ² = {lam}, Irvine {expected}");
    // In mm: w kN/mm, L mm, E kN/mm², A mm².
    let lam_mm = irvine_parameter(w / 1000.0, l * 1000.0, h, e / 1e6, a * 1e6);
    assert!(rel(lam_mm, lam) < 1e-12, "λ² in mm {lam_mm} vs in m {lam}");
}

/// SP-10 (OPEN). `catenary_ordinate` returns the hanging cable BELOW the chord
/// (y(L/2) = −sag for a level cable), `parabolic_ordinate` returns it ABOVE
/// (y(L/2) = +sag, and h/2 + f for an inclined one). They are meant to be the
/// exact and approximate forms of one curve; for a shallow cable they must agree.
/// The validation suite (cable_advanced_ext_parabolic_ordinate) pins the
/// parabolic sign, so the convention needs a decision before a fix.
#[test]
#[ignore = "open question SP-10: parabolic_ordinate is mirrored about the chord relative to catenary_ordinate"]
fn parabolic_and_catenary_ordinates_agree_for_shallow_cable() {
    let (h_t, w, l, h) = (5000.0, 1.0, 100.0, 10.0); // sag ≈ 0.25 m
    for x in [10.0, 25.0, 50.0, 80.0] {
        let (yc, _) = catenary_ordinate(h_t, w, l, h, x);
        let (yp, _) = parabolic_ordinate(h_t, w, l, h, x);
        assert!((yc - yp).abs() < 1e-3, "x = {x}: catenary {yc}, parabola {yp}");
    }
}

/// Catenary helper checks (pass): end conditions and the arc length of a level
/// catenary S = 2a·sinh(L/(2a)).
#[test]
fn catenary_ordinate_and_length() {
    let (h_t, w, l, h) = (800.0, 2.0, 60.0, 12.0);
    let (y0, _) = catenary_ordinate(h_t, w, l, h, 0.0);
    let (yl, _) = catenary_ordinate(h_t, w, l, h, l);
    assert!(y0.abs() < 1e-9 && (yl - h).abs() < 1e-9, "ends {y0}, {yl}");
    let a = h_t / w;
    let s = cable_length_catenary(h_t, w, l, 0.0);
    assert!(rel(s, 2.0 * a * (l / (2.0 * a)).sinh()) < 1e-12, "S = {s}");
    // Inclined: S² = h² + (2a·sinh(L/2a))².
    let s = cable_length_catenary(h_t, w, l, h);
    let ex = (h * h + (2.0 * a * (l / (2.0 * a)).sinh()).powi(2)).sqrt();
    assert!(rel(s, ex) < 1e-10, "inclined S = {s} vs {ex}");
}

/// SP-11 (FIXED, #415). Ernst's modulus is itself the TANGENT of the chord-tension
/// law: the chord of an elastic cable of weight w per unit length satisfies
/// ε(T) = T/EA − (w·l_h)²/(24T²) + const, so dT/dε = E·A/(1 + (w·l_h)²EA/(12T³)),
/// which is `ernst_equivalent_modulus`. `ernst_tangent_modulus` returns
/// that derivative now; it used to return E(1 + α(1 − 3α/(1+α)))/(1+α)², which no
/// derivation reproduces and which is negative here (−7.77e6 against 6.20e7 kN/m²).
#[test]
fn ernst_tangent_modulus_is_the_chord_law_derivative() {
    let (e, a, w, lh, t): (f64, f64, f64, f64, f64) = (160e6, 2e-3, 0.2, 200.0, 300.0);
    let eps = |t: f64| t / (e * a) - (w * lh).powi(2) / (24.0 * t * t);
    let dt = 1e-4 * t;
    let tangent = 2.0 * dt / (eps(t + dt) - eps(t - dt)) / a;
    assert!(rel(ernst_equivalent_modulus(e, a, w, lh, t), tangent) < 1e-6, "the 'equivalent' modulus is the tangent");
    assert!(rel(ernst_tangent_modulus(e, a, w, lh, t), tangent) < 1e-6,
        "ernst_tangent_modulus {} vs dT/dε/A {tangent}", ernst_tangent_modulus(e, a, w, lh, t));
}

/// SP-12 (FIXED, #416). The cable solver used to recover the tension with the Ernst
/// modulus as a SECANT from the node geometry: T = E_eq(T)·A·ε, i.e.
/// ε = T/EA + (w·l_h)²/(12T²). The elastic-catenary chord law with the
/// unstressed length equal to the chord is ε = T/EA − (w·l_h)²/(24T²): sag takes
/// up chord length, so the elastic strain (and T) for a given chord strain is
/// LARGER than EA·ε, not smaller. Statically determinate cables are unaffected
/// (equilibrium fixes T); in an indeterminate system the cable is assigned too
/// little tension. Here a horizontal steel cable shares a horizontal load with
/// a parallel spring; the check is the chord law at the converged state and the
/// closed form (spring and chord law re-solved by bisection): T = 9.5878 kN,
/// where the secant law gave 9.3905 kN.
#[test]
fn cable_tension_follows_the_elastic_catenary_chord_law() {
    let (l, a, rho) = (50.0, 1e-4, 7850.0);
    let mut input = common::make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, a, 1e-8)],
        vec![(1, "cable", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 10.0, fz: 0.0, my: 0.0 })],
    );
    input.supports.get_mut("2").unwrap().kx = Some(20.0);
    let dens = HashMap::from([("1".to_string(), rho)]);
    let r = cable::solve_cable_2d(&input, &dens, 200, 1e-12).unwrap();
    assert!(r.converged);
    let t = r.cable_forces[0].tension;
    let ux = r.results.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let w = rho / 1000.0 * a * 9.80665;
    let ea = 200e6 * a;
    let chord_law = t / ea - (w * l).powi(2) / (24.0 * t * t);
    assert!(rel(chord_law, ux / l) < 1e-9, "T = {t}: chord law ε = {chord_law}, solved ε = {}", ux / l);
    // Independent re-solve: 20·u + T = 10 with u/l = T/EA − (w·l)²/(24T²).
    let t_ref = bisect(|t| t / ea - (w * l).powi(2) / (24.0 * t * t) - (10.0 - t) / 20.0 / l, 1e-6, 10.0);
    assert!(rel(t, t_ref) < 1e-9, "T = {t}, closed form {t_ref}");
    assert!((t_ref - 9.587766).abs() < 1e-5, "closed form {t_ref}");
    // Equilibrium at the roller: spring plus cable carry the load.
    let rx: f64 = r.results.reactions.iter().map(|x| x.rx).sum();
    assert!((rx + 10.0).abs() < 1e-9, "ΣRx = {rx}");
    assert!(r.iterations < 15, "Newton on the chord law: {} passes", r.iterations);
}

/// Root of an increasing function on [lo, hi] by bisection.
fn bisect(f: impl Fn(f64) -> f64, mut lo: f64, mut hi: f64) -> f64 {
    for _ in 0..200 {
        let m = 0.5 * (lo + hi);
        if f(m) > 0.0 { hi = m } else { lo = m }
    }
    0.5 * (lo + hi)
}

/// SP-12 in 3D: the same horizontal cable and spring, along a skew horizontal
/// direction (l_h is the XY projection), against the same closed form.
#[test]
fn cable_tension_follows_the_chord_law_in_3d() {
    let (l, a, rho, k) = (50.0, 1e-4, 7850.0, 20.0);
    let (cx, cy) = (0.6, 0.8);
    let mut input = make_3d_input(
        vec![(1, 0.0, 0.0, 3.0), (2, l * cx, l * cy, 3.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, a, 1e-8, 1e-8, 1e-8)],
        vec![(1, "cable", 1, 2, 1, 1)],
        vec![(1, vec![true; 6]), (2, vec![false, false, true, true, true, true])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 10.0 * cx, fy: 10.0 * cy, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );
    let s = input.supports.get_mut("2").unwrap();
    s.kx = Some(k);
    s.ky = Some(k);
    let dens = HashMap::from([("1".to_string(), rho)]);
    let r = cable::solve_cable_3d(&input, &dens, 200, 1e-12).unwrap();
    assert!(r.converged);
    let t = r.cable_forces[0].tension;
    let ea = 200e6 * a;
    let w = rho / 1000.0 * a * 9.80665;
    let t_ref = bisect(|t| t / ea - (w * l).powi(2) / (24.0 * t * t) - (10.0 - t) / k / l, 1e-6, 10.0);
    assert!(rel(t, t_ref) < 1e-6, "T = {t}, closed form {t_ref}");
    let d = r.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let u = d.ux * cx + d.uy * cy;
    assert!(rel(u, (10.0 - t_ref) / k) < 1e-6, "u = {u}");
}

/// Without weight the chord law is the taut string T = EA·ε: cable and spring
/// share the load by stiffness, exactly as the linear solver shares it.
#[test]
fn weightless_cable_and_spring_share_by_stiffness() {
    let (l, a, k) = (50.0, 1e-4, 20.0);
    let mut input = common::make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, a, 1e-8)],
        vec![(1, "cable", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 10.0, fz: 0.0, my: 0.0 })],
    );
    input.supports.get_mut("2").unwrap().kx = Some(k);
    let r = cable::solve_cable_2d(&input, &HashMap::new(), 50, 1e-12).unwrap();
    assert!(r.converged);
    let kc = 200e6 * a / l;
    let t_ref = 10.0 * kc / (kc + k);
    assert!(rel(r.cable_forces[0].tension, t_ref) < 1e-9, "T = {}, {t_ref}", r.cable_forces[0].tension);
}

/// The unstressed length is the modelled chord, so a cable with weight between
/// two fixed points hangs at the tension that makes its sag fit: with no load,
/// T³ = EA·(w·l_h)²/24. Here its far end rides on a roller held by a strut of two
/// frame bars, which the cable compresses.
#[test]
fn unloaded_heavy_cable_hangs_at_the_chord_law_tension() {
    let (l, a, rho) = (40.0, 5e-4, 7850.0);
    let input = common::make_input(
        vec![(1, 0.0, 0.0), (2, l / 2.0, 0.0), (3, l, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, a, 1e-8)],
        vec![(1, "cable", 1, 3, 1, 1, false, false), (2, "frame", 1, 2, 1, 1, false, false), (3, "frame", 2, 3, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 3, "rollerX")],
        vec![],
    );
    let dens = HashMap::from([("1".to_string(), rho)]);
    let r = cable::solve_cable_2d(&input, &dens, 50, 1e-12).unwrap();
    assert!(r.converged);
    let w = rho / 1000.0 * a * 9.80665;
    let ea = 200e6 * a;
    let t_ref = (ea * (w * l).powi(2) / 24.0).cbrt();
    // The parallel frame bars (EA/L each) shorten under the pull, so the chord
    // shortens a little and the cable slackens a little: solve that too.
    let k_bars = 200e6 * a / l; // two bars of EA/(l/2) in series
    let t_sys = bisect(|t| t / ea - (w * l).powi(2) / (24.0 * t * t) + t / k_bars / l, 1e-6, 10.0 * t_ref);
    let t = r.cable_forces[0].tension;
    assert!(rel(t, t_sys) < 1e-9, "T = {t}, chord law with the bars {t_sys} (alone {t_ref})");
}

/// SP-13 (DOCUMENTED-CHOICE, pinned). The cable solver uses the cable density
/// only for Ernst's sag reduction; it does not apply the cable's weight as a
/// load: the vertical reactions of a loaded V cable equal the applied load
/// alone, with or without density.
#[test]
fn cable_density_is_not_a_load() {
    let p = 20.0;
    let input = common::make_input(
        vec![(1, 0.0, 0.0), (2, 10.0, -2.0), (3, 20.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 1e-3, 1e-8)],
        vec![(1, "cable", 1, 2, 1, 1, false, false), (2, "cable", 2, 3, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -p, my: 0.0 })],
    );
    let dens = HashMap::from([("1".to_string(), 7850.0)]);
    let r = cable::solve_cable_2d(&input, &dens, 50, 1e-10).unwrap();
    assert!(r.converged);
    let rz: f64 = r.results.reactions.iter().map(|x| x.rz).sum();
    assert!((rz - p).abs() < 1e-9 * p, "ΣRz = {rz}, applied {p}: no self-weight added");
    assert!(r.cable_forces.iter().all(|c| c.ernst_modulus < 200e6), "density still reduces the modulus");
}

/// SP-14 (OPEN). Outside the cable solver a "cable" member is assembled as a
/// plain truss bar, so the linear solver lets it carry compression without a
/// warning. Two cables from a mid node to two supports, the node pushed up:
/// both cables report compression.
#[test]
#[ignore = "open question SP-14: linear solve_2d lets a cable carry compression silently"]
fn linear_solver_does_not_report_cable_compression_silently() {
    let input = common::make_input(
        vec![(1, 0.0, 0.0), (2, 10.0, -2.0), (3, 20.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 1e-3, 1e-8)],
        vec![(1, "cable", 1, 2, 1, 1, false, false), (2, "cable", 2, 3, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: 10.0, my: 0.0 })],
    );
    match solve_2d(&input) {
        Err(_) => {}
        Ok(r) => {
            let compressed = r.element_forces.iter().any(|f| f.n_start < 0.0);
            let all = format!("{:?} {:?} {:?}", r.diagnostics, r.structured_diagnostics, r.solver_diagnostics).to_lowercase();
            let warned = all.contains("cable") || all.contains("compression") || all.contains("tension-only");
            assert!(!compressed || warned, "cables in compression without a diagnostic: N = {:?}",
                r.element_forces.iter().map(|f| f.n_start).collect::<Vec<_>>());
        }
    }
}

// ═════════════════════════════ CURVED BEAMS ════════════════════════════════

fn quarter_circle_cantilever(n: usize, r: f64, iy: f64, iz: f64) -> SolverInput3D {
    // Arc in the X–Z plane from (R,0,0) (fixed) to (0,0,R) through 45°.
    let s = std::f64::consts::FRAC_1_SQRT_2;
    let mut input = make_3d_input(
        vec![(1, r, 0.0, 0.0), (2, r * s, 0.0, r * s), (3, 0.0, 0.0, r)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 1.0, iy, iz, 1e-2)],
        vec![],
        vec![(1, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 3, fx: 0.0, fy: 0.0, fz: -10.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );
    input.curved_beams = vec![CurvedBeamInput {
        node_start: 1, node_mid: 2, node_end: 3, material_id: 1, section_id: 1,
        num_segments: n, hinge_start: false, hinge_end: false,
    }];
    input
}

/// Convergence of the polygonal curved beam to the exact in-plane curved
/// cantilever (Castigliano, bending only, A large): load P down at the free
/// end of a quarter circle, δ_z = πPR³/(4EI), δ_x = PR³/(2EI). The error of
/// the inscribed polygon falls as 1/N² (ratio ≈ 4 per doubling).
#[test]
fn curved_beam_quarter_circle_converges_to_castigliano() {
    let (r, iy, p): (f64, f64, f64) = (4.0, 1e-4, 10.0);
    let ei = 200e6 * iy;
    let dz = std::f64::consts::PI * p * r.powi(3) / (4.0 * ei);
    let dx = p * r.powi(3) / (2.0 * ei);
    let mut prev = f64::NAN;
    for n in [4, 8, 16, 32, 64] {
        let res = solve_3d(&quarter_circle_cantilever(n, r, iy, 1e-4)).unwrap();
        let d = res.displacements.iter().find(|d| d.node_id == 3).unwrap();
        let err = rel(-d.uz, dz);
        assert!(rel(-d.ux, dx) < 2.0 / (n * n) as f64 + 1e-4, "N = {n}: ux {} vs {dx}", d.ux);
        if n > 4 {
            let ratio = prev / err;
            assert!(ratio > 3.5 && ratio < 4.5, "N = {n}: error ratio {ratio} (err {err})");
        }
        prev = err;
    }
    assert!(prev < 1e-3, "N = 64 error {prev}");
}

/// Collinear points: the curved beam falls back to a straight member split
/// into equal segments, and solves exactly like a straight frame.
#[test]
fn curved_beam_collinear_falls_back_to_straight() {
    let cb = CurvedBeamInput { node_start: 1, node_mid: 2, node_end: 3, material_id: 1, section_id: 1, num_segments: 4, hinge_start: false, hinge_end: false };
    let ex = expand_curved_beam(&cb, [0.0, 0.0, 0.0], [1.0, 1.0, 1.0], [4.0, 4.0, 4.0], 10, 20);
    assert_eq!(ex.new_nodes.len(), 3);
    for (k, &(_, x, y, z)) in ex.new_nodes.iter().enumerate() {
        let t = 4.0 * (k + 1) as f64 / 4.0;
        assert!((x - t).abs() < 1e-14 && (y - t).abs() < 1e-14 && (z - t).abs() < 1e-14);
    }
    assert_eq!(ex.new_elements.len(), 4);
}

/// Expansion geometry: all generated nodes lie on the circle through the three
/// points, equally spaced in angle, and the arc goes through the mid point (the
/// short or the long way round as needed).
#[test]
fn curved_beam_nodes_on_circle_through_mid_point() {
    let cb = |n| CurvedBeamInput { node_start: 1, node_mid: 2, node_end: 3, material_id: 1, section_id: 1, num_segments: n, hinge_start: false, hinge_end: false };
    // Circle of radius 2 about (1, 2, 3) in a tilted plane.
    let (c, r) = ([1.0, 2.0, 3.0], 2.0);
    let u = [0.6, 0.0, 0.8];
    let v = [0.0, 1.0, 0.0];
    let at = |t: f64| [c[0] + r * (t.cos() * u[0] + t.sin() * v[0]), c[1] + r * (t.cos() * u[1] + t.sin() * v[1]), c[2] + r * (t.cos() * u[2] + t.sin() * v[2])];
    // 270° arc: start 0, mid 100°, end 270° (long way, the mid point forces it).
    let (t0, tm, t1) = (0.0f64, 100f64.to_radians(), 270f64.to_radians());
    let n = 9;
    let ex = expand_curved_beam(&cb(n), at(t0), at(tm), at(t1), 10, 20);
    for (k, &(_, x, y, z)) in ex.new_nodes.iter().enumerate() {
        let p = at(t0 + (t1 - t0) * (k + 1) as f64 / n as f64);
        assert!((x - p[0]).abs() < 1e-12 && (y - p[1]).abs() < 1e-12 && (z - p[2]).abs() < 1e-12, "node {k}: ({x},{y},{z}) vs {p:?}");
    }
}

/// SP-15 (FIXED, #418). Segment local axes. The expansion left local_y unset,
/// so each straight segment took the default Z-up axes; a segment within 2.56°
/// of vertical (|ex·Z| > 0.999) switched to the global-X reference. In an arch
/// in the X–Z plane both references keep local z in the arch plane, but in any
/// other vertical plane the near-vertical segments got local z NORMAL to the
/// plane: Iy and Iz swapped on them. Every segment now takes its axes from the
/// arc (`ArcSectionFrame`). The same semicircular arch, rotated 90° about Z,
/// must give the same (rotated) crown deflection.
#[test]
fn curved_beam_arch_is_invariant_under_plan_rotation() {
    let crown = |in_yz: bool| {
        let (r, n) = (5.0, 40);
        let p = |x: f64, z: f64| if in_yz { (0.0, x, z) } else { (x, 0.0, z) };
        let (a, b, c) = (p(-r, 0.0), p(0.0, r), p(r, 0.0));
        let mut input = make_3d_input(
            vec![(1, a.0, a.1, a.2), (2, b.0, b.1, b.2), (3, c.0, c.1, c.2)],
            vec![(1, 200_000.0, 0.3)],
            vec![(1, 0.02, 1e-5, 1e-3, 1e-4)], // Iz ≫ Iy: strong axis about local z
            vec![],
            vec![(1, vec![true; 6]), (3, vec![true; 6])],
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 0.0, fy: 0.0, fz: -10.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
        );
        input.curved_beams = vec![CurvedBeamInput { node_start: 1, node_mid: 2, node_end: 3, material_id: 1, section_id: 1, num_segments: n, hinge_start: false, hinge_end: false }];
        let res = solve_3d(&input).unwrap();
        res.displacements.iter().find(|d| d.node_id == 2).unwrap().uz
    };
    let (xz, yz) = (crown(false), crown(true));
    assert!(rel(yz, xz) < 1e-6, "crown uz: arch in X–Z {xz}, same arch in Y–Z {yz}");
}

/// A semicircular arch of radius `r` springing from (±r, 0, 0) rotated by `phi` about Z, with
/// `n` segments, fixed at both springings, Iy ≠ Iz, under a vertical and an in-plane horizontal
/// load at the crown (node 2). Either as a curved beam, or as explicit straight members (`explicit`)
/// whose local y is `local_y(ex)` (None: the default rule).
fn sp15_arch(phi: f64, n: usize, explicit: Option<&dyn Fn([f64; 3]) -> Option<[f64; 3]>>) -> SolverInput3D {
    let r = 5.0;
    let (c, s) = (phi.cos(), phi.sin());
    let rot = |x: f64, z: f64| (x * c, x * s, z);
    let pt = |k: usize| {
        let th = std::f64::consts::PI * (1.0 - k as f64 / n as f64);
        rot(r * th.cos(), r * th.sin())
    };
    let (a, b, e) = (pt(0), pt(n / 2), pt(n));
    // In-plane horizontal load along the arch's own axis, plus gravity.
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 3.0 * c, fy: 3.0 * s, fz: -10.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })];
    let sec = vec![(1, 0.02, 1e-5, 1e-3, 1e-4)];
    let sups = vec![(1, vec![true; 6]), (3, vec![true; 6])];
    match explicit {
        None => {
            let mut input = make_3d_input(
                vec![(1, a.0, a.1, a.2), (2, b.0, b.1, b.2), (3, e.0, e.1, e.2)],
                vec![(1, 200_000.0, 0.3)], sec, vec![], sups, loads,
            );
            input.curved_beams = vec![CurvedBeamInput { node_start: 1, node_mid: 2, node_end: 3, material_id: 1, section_id: 1, num_segments: n, hinge_start: false, hinge_end: false }];
            input
        }
        Some(local_y) => {
            // Node ids: 1 start, 2 crown, 3 end, 10+k the others.
            let id = |k: usize| if k == 0 { 1 } else if k == n / 2 { 2 } else if k == n { 3 } else { 10 + k };
            let nodes = (0..=n).map(|k| { let p = pt(k); (id(k), p.0, p.1, p.2) }).collect();
            let elems = (0..n).map(|k| (100 + k, "frame", id(k), id(k + 1), 1, 1)).collect();
            let mut input = make_3d_input(nodes, vec![(1, 200_000.0, 0.3)], sec, elems, sups, loads);
            for k in 0..n {
                let (p, q) = (pt(k), pt(k + 1));
                let d = [q.0 - p.0, q.1 - p.1, q.2 - p.2];
                let l = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
                if let Some(v) = local_y([d[0] / l, d[1] / l, d[2] / l]) {
                    let el = input.elements.get_mut(&(100 + k).to_string()).unwrap();
                    (el.local_yx, el.local_yy, el.local_yz) = (Some(v[0]), Some(v[1]), Some(v[2]));
                }
            }
            input
        }
    }
}

/// Crown displacement (ux, uy, uz, rx, ry, rz) of an `sp15_arch`, turned back by `phi` about Z.
fn sp15_crown(input: &SolverInput3D, phi: f64) -> [f64; 6] {
    let res = solve_3d(input).unwrap();
    let d = res.displacements.iter().find(|d| d.node_id == 2).unwrap();
    let (c, s) = (phi.cos(), phi.sin());
    [c * d.ux + s * d.uy, -s * d.ux + c * d.uy, d.uz, c * d.rx + s * d.ry, -s * d.rx + c * d.ry, d.rz]
}

/// SP-15 (#418). An arch with Iy ≠ Iz under in-plane loads gives what the same arch gives modelled
/// with explicit straight members whose local y is the plane normal on every one, in any plan
/// orientation; and the same members on the default rule (what the expansion did before) do not.
#[test]
fn curved_beam_arch_matches_explicit_members_with_plane_normal_axes() {
    let n = 40;
    for deg in [0.0f64, 30.0, 90.0, 137.0] {
        let phi = deg.to_radians();
        let normal = [-phi.sin(), phi.cos(), 0.0];
        let curved = sp15_crown(&sp15_arch(phi, n, None), phi);
        let explicit = sp15_crown(&sp15_arch(phi, n, Some(&|_| Some(normal))), phi);
        let scale = curved.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        for i in 0..6 {
            assert!((curved[i] - explicit[i]).abs() < 1e-9 * scale, "{deg}°, dof {i}: curved {curved:?} vs explicit {explicit:?}");
        }
    }
    // Before the fix: default axes on every segment. At 90° the near-vertical
    // springing segments had Iy and Iz swapped, so the crown moved less.
    let phi = 90f64.to_radians();
    let default = sp15_crown(&sp15_arch(phi, n, Some(&|_| None)), phi);
    let fixed = sp15_crown(&sp15_arch(phi, n, None), phi);
    let xz = sp15_crown(&sp15_arch(0.0, n, None), 0.0);
    let xz_default = sp15_crown(&sp15_arch(0.0, n, Some(&|_| None)), 0.0);
    eprintln!("crown (in-plane u, out-of-plane, uz): X–Z fixed {xz:?}, X–Z default {xz_default:?}, Y–Z default {default:?}, Y–Z fixed {fixed:?}");
    assert!(rel(default[2], fixed[2]) > 0.05, "default-axes crown uz {} vs fixed {}", default[2], fixed[2]);
}

/// SP-15 (#418). The whole arch rotated about the vertical gives the same displacements, reactions
/// and member end forces (in the members' own axes) whatever the angle.
#[test]
fn curved_beam_arch_results_are_invariant_under_rotation_about_vertical() {
    let n = 40;
    let solve = |deg: f64| solve_3d(&sp15_arch(deg.to_radians(), n, None)).unwrap();
    let base = solve(0.0);
    let crown0 = sp15_crown(&sp15_arch(0.0, n, None), 0.0);
    for deg in [17.0f64, 45.0, 90.0, 180.0, 251.0] {
        let phi = deg.to_radians();
        let crown = sp15_crown(&sp15_arch(phi, n, None), phi);
        let scale = crown0.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        for i in 0..6 {
            assert!((crown[i] - crown0[i]).abs() < 1e-9 * scale, "{deg}°, dof {i}: {crown:?} vs {crown0:?}");
        }
        let res = solve(deg);
        let fmax = base.element_forces.iter().map(|f| f.my_start.abs().max(f.mz_start.abs())).fold(0.0, f64::max);
        for f0 in &base.element_forces {
            let f = res.element_forces.iter().find(|f| f.element_id == f0.element_id).unwrap();
            for (a, b, what) in [
                (f.n_start, f0.n_start, "N"), (f.vy_start, f0.vy_start, "Vy"), (f.vz_start, f0.vz_start, "Vz"),
                (f.my_start, f0.my_start, "My"), (f.mz_start, f0.mz_start, "Mz"), (f.my_end, f0.my_end, "My end"),
                (f.mz_end, f0.mz_end, "Mz end"), (f.mx_start, f0.mx_start, "T"),
            ] {
                assert!((a - b).abs() < 1e-7 * fmax.max(1.0), "{deg}°, element {}: {what} {a} vs {b}", f0.element_id);
            }
        }
    }
}

/// SP-15 (#418). A plan curve keeps the axes it had: local z vertical on every segment, the same
/// as straight members on the default rule.
#[test]
fn curved_beam_plan_curve_keeps_default_axes() {
    let (r, n) = (6.0, 12);
    let pt = |k: usize| { let th = std::f64::consts::FRAC_PI_2 * k as f64 / n as f64; (r * th.cos(), r * th.sin(), 3.0) };
    let sec = vec![(1, 0.02, 1e-5, 1e-3, 1e-4)];
    let sups = vec![(1, vec![true; 6]), (3, vec![true; 6])];
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 2.0, fy: -1.0, fz: -10.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })];
    let (a, b, e) = (pt(0), pt(n / 2), pt(n));
    let mut curved = make_3d_input(vec![(1, a.0, a.1, a.2), (2, b.0, b.1, b.2), (3, e.0, e.1, e.2)], vec![(1, 200_000.0, 0.3)], sec.clone(), vec![], sups.clone(), loads.clone());
    curved.curved_beams = vec![CurvedBeamInput { node_start: 1, node_mid: 2, node_end: 3, material_id: 1, section_id: 1, num_segments: n, hinge_start: false, hinge_end: false }];
    let id = |k: usize| if k == 0 { 1 } else if k == n / 2 { 2 } else if k == n { 3 } else { 10 + k };
    let explicit = make_3d_input(
        (0..=n).map(|k| { let p = pt(k); (id(k), p.0, p.1, p.2) }).collect(),
        vec![(1, 200_000.0, 0.3)], sec,
        (0..n).map(|k| (100 + k, "frame", id(k), id(k + 1), 1, 1)).collect(),
        sups, loads,
    );
    let d = |i: &SolverInput3D| { let r = solve_3d(i).unwrap(); let d = r.displacements.iter().find(|d| d.node_id == 2).unwrap().clone(); [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz] };
    let (c, x) = (d(&curved), d(&explicit));
    let scale = x.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    for i in 0..6 {
        assert!((c[i] - x[i]).abs() < 1e-10 * scale, "dof {i}: curved {c:?} vs default-axis members {x:?}");
    }
    // And every expanded segment has local z = +Z.
    let ex = dedaliano_engine::solver::linear::expand_curved_beams_3d(&curved);
    for el in ex.elements.values() {
        let (ni, nj) = (&ex.nodes[&el.node_i.to_string()], &ex.nodes[&el.node_j.to_string()]);
        let (_, _, ez) = dedaliano_engine::element::compute_local_axes_3d(ni.x, ni.y, ni.z, nj.x, nj.y, nj.z, el.local_yx, el.local_yy, el.local_yz, el.roll_angle, false);
        assert!((ez[2] - 1.0).abs() < 1e-12, "element {}: ez {ez:?}", el.id);
    }
}

/// SP-15 (#418). In a tilted plane the section does not roll along the arc: local y makes the same
/// angle with the plane normal on every segment, near-vertical ones included.
#[test]
fn curved_beam_section_does_not_roll_along_a_tilted_arc() {
    for tilt in [0.0f64, 20.0, 60.0, 89.0] {
        let t = tilt.to_radians();
        // Plane spanned by u = (cos t·cos 35°, cos t·sin 35°, sin t)... built from a vertical arch tilted about its chord.
        let (cphi, sphi) = (35f64.to_radians().cos(), 35f64.to_radians().sin());
        let chord = [cphi, sphi, 0.0];
        let up = [-t.sin() * -sphi, -t.sin() * cphi, t.cos()]; // the vertical tilted by t about the chord
        let r = 4.0;
        let p = |th: f64| [r * th.cos() * chord[0] + r * th.sin() * up[0], r * th.cos() * chord[1] + r * th.sin() * up[1], 2.0 + r * th.cos() * chord[2] + r * th.sin() * up[2]];
        let (a, b, e) = (p(std::f64::consts::PI), p(std::f64::consts::FRAC_PI_2), p(0.0));
        let mut input = make_3d_input(
            vec![(1, a[0], a[1], a[2]), (2, b[0], b[1], b[2]), (3, e[0], e[1], e[2])],
            vec![(1, 200_000.0, 0.3)], vec![(1, 0.02, 1e-5, 1e-3, 1e-4)], vec![],
            vec![(1, vec![true; 6]), (3, vec![true; 6])], vec![],
        );
        input.curved_beams = vec![CurvedBeamInput { node_start: 1, node_mid: 2, node_end: 3, material_id: 1, section_id: 1, num_segments: 40, hinge_start: false, hinge_end: false }];
        let normal = { let c = [chord[1] * up[2] - chord[2] * up[1], chord[2] * up[0] - chord[0] * up[2], chord[0] * up[1] - chord[1] * up[0]]; c };
        let ex = dedaliano_engine::solver::linear::expand_curved_beams_3d(&input);
        let mut cosines = Vec::new();
        for el in ex.elements.values() {
            let (ni, nj) = (&ex.nodes[&el.node_i.to_string()], &ex.nodes[&el.node_j.to_string()]);
            let (_, ey, _) = dedaliano_engine::element::compute_local_axes_3d(ni.x, ni.y, ni.z, nj.x, nj.y, nj.z, el.local_yx, el.local_yy, el.local_yz, el.roll_angle, false);
            cosines.push(ey[0] * normal[0] + ey[1] * normal[1] + ey[2] * normal[2]);
        }
        let (lo, hi) = cosines.iter().fold((f64::MAX, f64::MIN), |(l, h), &c| (l.min(c), h.max(c)));
        assert!(hi - lo < 1e-9, "tilt {tilt}°: ey·n ranges over [{lo}, {hi}]");
    }
}

// ═════════════════════════════ CONNECTORS ══════════════════════════════════

/// SP-16 (DOCUMENTED-CHOICE, pinned). A zero-length 3D connector takes local
/// x = global X, and its own reference rule (not the frame's Z-up rule) gives
/// local y = −Z and local z = +Y. So `k_shear` ("local Y") acts along global Z,
/// `k_shear_z` along global Y, `k_bend_y` about Z and `k_bend_z` about Y. In 2D
/// the shear spring of a zero-length connector is along global Z too.
#[test]
fn connector_zero_length_3d_axis_mapping() {
    let k = connector_stiffness_3d(1.0, 2.0, 3.0, 4.0, 5.0, 6.0, [1.0, 0.0, 0.0], 0.0);
    let d = |i: usize| k[i * 12 + i];
    assert_eq!([d(0), d(1), d(2)], [1.0, 3.0, 2.0], "translations X, Y, Z ← k_axial, k_shear_z, k_shear");
    assert_eq!([d(3), d(4), d(5)], [4.0, 6.0, 5.0], "rotations X, Y, Z ← k_moment, k_bend_z, k_bend_y");
}

/// SP-17 (OPEN). The 3D connector frame jumps where its reference vector
/// switches (global X while |dir·X| < 0.9, else global Y). With anisotropic
/// transverse springs two connectors 1e-6 apart in direction get very different local axes.
/// There is no local_y / roll input to fix the orientation.
#[test]
#[ignore = "open question SP-17: 3D connector local axes are discontinuous at |dir_x| = 0.9 and not user-settable"]
fn connector_3d_axes_are_continuous_in_direction() {
    // Out of the XY plane (in it both references give local y = ±Z).
    let dir = |x: f64| { let t = ((1.0 - x * x) / 2.0).sqrt(); [x, t, t] };
    let k1 = connector_stiffness_3d(1.0, 100.0, 1.0, 1.0, 1.0, 1.0, dir(0.9 - 1e-6), 0.0);
    let k2 = connector_stiffness_3d(1.0, 100.0, 1.0, 1.0, 1.0, 1.0, dir(0.9 + 1e-6), 0.0);
    let diff = (0..144).map(|i| (k1[i] - k2[i]).abs()).fold(0.0, f64::max);
    assert!(diff < 0.1, "stiffness jumps by {diff} across the reference switch");
}

/// SP-7 follow-up (review of #330). The fiber force correction must remove the same elastic
/// K·u the linear recovery adds; with shear areas that is the Timoshenko K. Both now share
/// `timoshenko_phi_2d/3d` (unit tests `fiber_member_forces_with_shear_areas_are_resultants_minus_fef_2d/3d`
/// in `solver/fiber_nonlinear.rs`). Through the public solvers the case is refused today: the
/// fiber element is Euler–Bernoulli, so a section with shear areas is refused rather than
/// solved without them. Pinned so that lifting the gate is a deliberate change.
#[test]
fn fiber_solvers_refuse_shear_areas() {
    let sec = rectangular_fiber_section(0.2, 0.4, 10, FiberMaterial::Elastic { e: 200_000.0 });
    let mut input = fiber_cantilever_2d(3.0, sec, 0.0, -10.0, 5, 1, 1e-10);
    input.solver.sections.get_mut("1").unwrap().as_y = Some(0.0667);
    let err = solve_fiber_nonlinear_2d(&input).unwrap_err();
    assert!(err.contains("shear"), "{err}");
}

/// Non-positive shear areas are refused by validation: φ = 12EI/(G·As·L²) was ∞ (NaN stiffness)
/// for 0 and negative for a negative area, silently, on every path.
#[test]
fn non_positive_shear_areas_are_refused() {
    for v in [0.0, -0.05] {
        let mut s2 = make_beam(1, 3.0, 200_000.0, 0.01, 1e-4, "fixed", None,
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -1.0, my: 0.0 })]);
        s2.sections.get_mut("1").unwrap().as_y = Some(v);
        assert!(solve_2d(&s2).unwrap_err().contains("shear area"));
        let mut s3 = make_3d_beam(1, 3.0, 200_000.0, 0.3, 0.01, 1e-4, 1e-4, 1e-4, vec![true; 6], None,
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 0.0, fy: 0.0, fz: -1.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })]);
        s3.sections.get_mut("1").unwrap().as_z = Some(v);
        assert!(solve_3d(&s3).unwrap_err().contains("shear area"));
    }
}

/// SP-12, the advisory case (SA-2026-015): a 20 m mast fixed at its base, guyed
/// from its top to an anchor 20 m out, 5 kN at the top away from the anchor.
/// Mast and guy share the load, so the guy's tension depends on its law. The
/// closed form condenses the mast to its top (3EI/L³ sideways, EA/L axially) and
/// solves the chord law by bisection: T = 5.183 kN. The secant law gave
/// 4.340 kN (16 % low, after 28 passes) and, at 2 kN, did not converge.
#[test]
fn guyed_mast_cable_tension_matches_the_chord_law() {
    for (p, t_expected) in [(5.0, Some(5.1827)), (2.0, None)] {
        let (a_c, rho, e) = (1e-4, 7850.0, 200e6);
        let input = common::make_input(
            vec![(1, 0.0, 0.0), (2, 0.0, 20.0), (3, 20.0, 0.0)],
            vec![(1, 200_000.0, 0.3), (2, 200_000.0, 0.3)],
            vec![(1, 5e-2, 2e-3), (2, a_c, 1e-10)],
            vec![(1, "frame", 1, 2, 1, 1, false, false), (2, "cable", 2, 3, 2, 2, false, false)],
            vec![(1, 1, "fixed"), (2, 3, "pinned")],
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: -p, fz: 0.0, my: 0.0 })],
        );
        let dens = HashMap::from([("2".to_string(), rho)]);
        let r = cable::solve_cable_2d(&input, &dens, 50, 1e-10).unwrap();
        assert!(r.converged, "P = {p}: {} passes", r.iterations);
        let (s2, l) = (std::f64::consts::SQRT_2, 20.0 * std::f64::consts::SQRT_2);
        let (kh, kv, ea) = (3.0 * e * 2e-3 / 8000.0, e * 5e-2 / 20.0, e * a_c);
        let w = rho / 1000.0 * a_c * 9.80665;
        let t_ref = bisect(|t| {
            let (ux, uz) = ((t / s2 - p) / kh, -t / s2 / kv);
            t / ea - (w * 20.0).powi(2) / (24.0 * t * t) - (uz - ux) / s2 / l
        }, 1e-6, 20.0);
        if let Some(te) = t_expected { assert!((t_ref - te).abs() < 1e-4, "closed form {t_ref}"); }
        let t = r.cable_forces[0].tension;
        // Small-displacement closed form against the solver's deformed-chord strain.
        assert!(rel(t, t_ref) < 1e-4, "P = {p}: T = {t}, closed form {t_ref}");
        // The base reaction balances the load and the guy.
        let rx: f64 = r.results.reactions.iter().map(|x| x.rx).sum();
        assert!((rx - p).abs() < 1e-8 * p, "ΣRx = {rx}");
    }
}

/// `cable_chord_tension` solves the chord law over the whole range of strains,
/// including roots many orders of magnitude below the sag scale, without
/// under- or overflow, and refuses an invalid strain rather than returning a
/// plausible tension.
#[test]
fn cable_chord_tension_is_robust() {
    use dedaliano_engine::element::cable_chord_tension;
    let law = |ea: f64, w: f64, lh: f64, t: f64| t / ea - (w * lh).powi(2) / (24.0 * t * t);
    for &(ea, w, lh) in &[(2e4, 7.7e-3, 50.0), (1.0, 1.0, 1.0), (1e6, 0.5, 300.0)] {
        for &eps in &[-1e3, -1.0, -1e-3, -1e-9, 0.0, 1e-9, 1e-3, 1.0, 1e3] {
            let t = cable_chord_tension(ea, w, lh, eps);
            assert!(t > 0.0 && t.is_finite(), "T({eps}) = {t}");
            let back = law(ea, w, lh, t);
            let scale = eps.abs().max(t / ea).max((w * lh).powi(2) / (24.0 * t * t));
            assert!((back - eps).abs() <= 1e-12 * scale, "ε({t}) = {back} vs {eps}");
        }
    }
    // A root 40 orders of magnitude below the sag scale.
    let t = cable_chord_tension(1.0, 1.0, 1.0, -1e200);
    assert!(rel(t, (1.0 / 24.0 / 1e200f64).sqrt()) < 1e-12, "tiny root {t}");
    // Huge and tiny scales: no under/overflow.
    assert!(rel(cable_chord_tension(1e200, 1e-200, 1.0, 0.0), (1e200f64 / 24.0).cbrt() * 1e-200f64.cbrt().powi(2)) < 1e-12);
    assert!(rel(cable_chord_tension(1e200, 1e60, 1.0, 0.0), (1e200f64 / 24.0).cbrt() * 1e60f64.cbrt().powi(2)) < 1e-12);
    // Extreme scales that overflow intermediate products (Codex review).
    assert!(rel(cable_chord_tension(24.0, 1e-150, 1.0, 4e206), 24.0 * 4e206) < 1e-12);
    assert!(rel(cable_chord_tension(1e300, 1e-200, 1.0, -1.0), 1e-200 / 24f64.sqrt()) < 1e-9);
    assert!(rel(cable_chord_tension(1e-300, 1e200, 1e200, 0.0), 10f64.powf(500.0 / 3.0) / 24f64.cbrt()) < 1e-9);
    // Weightless: the taut string.
    assert_eq!(cable_chord_tension(2e4, 0.0, 50.0, 1e-3), 20.0);
    assert_eq!(cable_chord_tension(2e4, 0.0, 50.0, -1e-3), 0.0);
    assert!(cable_chord_tension(1.0, 1.0, 1.0, f64::NAN).is_nan());
    // Beyond the floating-point range: refused, never a plausible zero.
    assert!(cable_chord_tension(1e308, 1e308, 12.5, -1.0).is_nan());
    assert!(cable_chord_tension(1e200, 1.0, 1.0, -1e200).is_nan());
}

/// A cable ending on an inclined roller: the tangent correction and the chord-law
/// forces are rotated with the support (they used to be added unrotated, so the
/// iteration could stop away from equilibrium). The roller node is also held by a
/// soft bar, so the cable law decides the share; closed form by bisection along
/// the roller's free direction.
#[test]
fn cable_on_an_inclined_roller_follows_the_chord_law() {
    let (l, a, rho, p, theta, a_bar) = (50.0, 1e-4, 7850.0, 10.0, 0.5_f64, 2e-6);
    let mut input = common::make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0), (3, l, -5.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, a, 1e-8), (2, a_bar, 1e-12)],
        vec![(1, "cable", 1, 2, 1, 1, false, false), (2, "truss", 2, 3, 1, 2, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "inclinedRoller"), (3, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: p, fz: 0.0, my: 0.0 })],
    );
    input.supports.get_mut("2").unwrap().angle = Some(theta);
    let dens = HashMap::from([("1".to_string(), rho)]);
    let r = cable::solve_cable_2d(&input, &dens, 100, 1e-12).unwrap();
    assert!(r.converged);
    let (tx, tz) = (-theta.cos(), theta.sin()); // the roller's free direction
    let (ea, kb) = (200e6 * a, 200e6 * a_bar / 5.0);
    let w = rho / 1000.0 * a * 9.80665;
    let t_ref = bisect(|t| t / ea - (w * l).powi(2) / (24.0 * t * t) - tx * tx * (p - t) / (kb * tz * tz * l), 1e-6, p);
    let t = r.cable_forces[0].tension;
    assert!(rel(t, t_ref) < 1e-4, "T = {t}, closed form {t_ref}");
    // The node moves along the roller only, and the statics close.
    let d = r.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    assert!((d.ux * theta.sin() + d.uz * theta.cos()).abs() < 1e-12, "normal displacement {d:?}");
    let rx: f64 = r.results.reactions.iter().map(|x| x.rx).sum();
    let rz: f64 = r.results.reactions.iter().map(|x| x.rz).sum();
    assert!((rx + p).abs() < 1e-6 * p && rz.abs() < 1e-6 * p, "ΣR = ({rx}, {rz})");
}
