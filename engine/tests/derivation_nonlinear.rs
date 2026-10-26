//! Derivation checks for the nonlinear formulations (docs/solver/nonlinear.md).
//!
//! Each test checks one statement of the derivation: the co-rotational tangent
//! is the exact derivative of its internal force vector (finite differences),
//! internal forces vanish under a rigid-body motion of any size, the solvers
//! are frame-invariant, P-Delta agrees with the closed-form second-order
//! solution and with linear buckling, and so on. Tests marked
//! `#[ignore = "open question NL-k: ..."]` demonstrate a discrepancy that is
//! listed, with its analysis, in the open-questions section of the document.

use crate::common;

use common::*;
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::{buckling, corotational, linear, pdelta};
use dedaliano_engine::types::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa

fn close(a: f64, b: f64, rel: f64, what: &str) {
    let scale = a.abs().max(b.abs()).max(1e-12);
    assert!((a - b).abs() <= rel * scale, "{what}: {a} vs {b} (rel {:.3e})", (a - b).abs() / scale);
}

fn disp2(r: &AnalysisResults, id: usize) -> &Displacement {
    r.displacements.iter().find(|d| d.node_id == id).unwrap()
}

fn disp3(r: &AnalysisResults3D, id: usize) -> &Displacement3D {
    r.displacements.iter().find(|d| d.node_id == id).unwrap()
}

// ======================================================================
// 2D co-rotational frame element
// ======================================================================

/// One 2D member from (xi, zi) to (xj, zj), both ends free (no supports), so
/// every DOF is in `u_full` and the element is seen whole.
fn single_member_2d(xi: f64, zi: f64, xj: f64, zj: f64, hinge_end: bool, as_y: Option<f64>) -> SolverInput {
    let mut m = make_input(
        vec![(1, xi, zi), (2, xj, zj)],
        vec![(1, E, 0.3)],
        vec![(1, 0.01, 2e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, hinge_end)],
        vec![],
        vec![],
    );
    m.sections.get_mut("1").unwrap().as_y = as_y;
    m
}

/// f_int and dense K_T of the co-rotational 2D assembly at `u` (n_total DOFs).
fn corot_2d(input: &SolverInput, u: &[f64]) -> (Vec<f64>, Vec<f64>) {
    let dof = DofNumbering::build_2d(input);
    let n = dof.n_total;
    let mut f = vec![0.0; n];
    let mut k = vec![0.0; n * n];
    corotational::assemble_corotational_public(input, &dof, u, &mut f, &mut k);
    (f, k)
}

/// Element DOF vector u = [ux_i, uz_i, θ_i, ux_j, uz_j, θ_j] in the assembly's
/// DOF order.
fn u_vec_2d(input: &SolverInput, vals: [f64; 6]) -> Vec<f64> {
    let dof = DofNumbering::build_2d(input);
    let mut u = vec![0.0; dof.n_total];
    for (k, (node, l)) in [(1, 0), (1, 1), (1, 2), (2, 0), (2, 1), (2, 2)].into_iter().enumerate() {
        u[dof.global_dof(node, l).unwrap()] = vals[k];
    }
    u
}

/// K_T = ∂f_int/∂u for the 2D co-rotational frame (Crisfield vol. 1 §7.3):
/// B^T k_nat B + N/l zzᵀ + (M1+M2)/l² (rzᵀ + zrᵀ), checked column by column
/// against central differences of f_int at a large-rotation state with
/// nonzero N, M1, M2; with and without an end release and shear deformation.
#[test]
fn nl_corot2d_tangent_is_the_derivative_of_the_internal_forces() {
    for (hinge, as_y) in [(false, None), (true, None), (false, Some(0.004))] {
        let input = single_member_2d(0.3, -0.2, 3.1, 1.4, hinge, as_y);
        let u = u_vec_2d(&input, [0.05, -0.02, 0.7, -0.4, 0.3, 0.9]);
        let (f0, k) = corot_2d(&input, &u);
        let n = f0.len();
        let fmax = f0.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        assert!(fmax > 1.0, "the state must carry force");
        let kmax = k.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        let h = 1e-6;
        for j in 0..n {
            let mut up = u.clone();
            let mut um = u.clone();
            up[j] += h;
            um[j] -= h;
            let (fp, _) = corot_2d(&input, &up);
            let (fm, _) = corot_2d(&input, &um);
            for i in 0..n {
                let fd = (fp[i] - fm[i]) / (2.0 * h);
                assert!(
                    (fd - k[i * n + j]).abs() <= 1e-6 * kmax,
                    "hinge {hinge}, as {as_y:?}: K[{i},{j}] = {} vs FD {fd}",
                    k[i * n + j]
                );
            }
        }
        // Symmetric: the element is hyperelastic (f_int derives from a potential).
        for i in 0..n {
            for j in 0..i {
                assert!((k[i * n + j] - k[j * n + i]).abs() <= 1e-9 * kmax, "K not symmetric at ({i},{j})");
            }
        }
    }
}

/// A rigid-body motion of any size produces no internal force: translations
/// (a, b) and rotation ψ, u = R(ψ)X + (a, b) − X, θ = ψ at both nodes. For
/// members pointing in every direction, including along −X (α0 = π, the
/// branch cut of atan2), and rotations past ±π.
#[test]
fn nl_corot2d_rigid_body_motion_is_stress_free() {
    for (xj, zj) in [(4.0, 0.0), (0.0, 4.0), (-4.0, 0.0), (-2.0, -3.0), (3.0, -2.0)] {
        let input = single_member_2d(0.0, 0.0, xj, zj, false, None);
        for psi in [0.3, -0.3, 1.5, 3.0, -3.0, 4.0, -5.0] {
            let (c, s) = (f64::cos(psi), f64::sin(psi));
            let rot = |x: f64, z: f64| (c * x - s * z - x, s * x + c * z - z);
            let (ui, wi) = rot(0.0, 0.0);
            let (uj, wj) = rot(xj, zj);
            let u = u_vec_2d(&input, [ui + 0.7, wi - 0.2, psi, uj + 0.7, wj - 0.2, psi]);
            let (f, _) = corot_2d(&input, &u);
            for v in &f {
                assert!(v.abs() < 1e-6, "member to ({xj},{zj}), ψ = {psi}: internal force {v}");
            }
        }
    }
}

/// A cantilever is the same structure whichever end its members start from.
/// Fixed at x = 4 m with its members running right to left (local x along −X),
/// it must deflect exactly as the mirror image of the one fixed at x = 0.
#[test]
fn nl_corot2d_cantilever_drawn_right_to_left_matches_mirror() {
    let build = |leftward: bool| {
        let n_el = 4;
        let nodes: Vec<_> = (0..=n_el)
            .map(|k| {
                let x = 4.0 * k as f64 / n_el as f64;
                (k + 1, if leftward { 4.0 - x } else { x }, 0.0)
            })
            .collect();
        let elems = (1..=n_el).map(|k| (k, "frame", k, k + 1, 1, 1, false, false)).collect();
        make_input(
            nodes,
            vec![(1, E, 0.3)],
            vec![(1, 0.01, 1e-5)],
            elems,
            vec![(1, 1, "fixed")],
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: n_el + 1, fx: 0.0, fz: -40.0, my: 0.0 })],
        )
    };
    let right = corotational::solve_corotational_2d(&build(false), 50, 1e-9, 10, false).unwrap();
    let left = corotational::solve_corotational_2d(&build(true), 50, 1e-9, 10, false).unwrap();
    assert!(right.converged, "rightward cantilever must converge");
    assert!(left.converged, "leftward cantilever must converge");
    let (r, l) = (disp2(&right.results, 5), disp2(&left.results, 5));
    assert!(r.uz < -0.3, "large deflection expected, got {}", r.uz);
    close(l.uz, r.uz, 1e-6, "tip uz");
    close(l.ux, -r.ux, 1e-6, "tip ux (mirrored)");
    close(l.ry, -r.ry, 1e-6, "tip rotation (mirrored)");
}

/// Euler's elastica under an end moment: a cantilever bent by M closes into a
/// circular arc of curvature M/EI, tip rotation φ = ML/EI, tip at
/// (L sin φ/φ, L(1 − cos φ)/φ). Up to φ = 1.5π the member chords turn past
/// ±π: the extraction of the deformational rotation must not depend on the
/// branch of atan2.
#[test]
fn nl_corot2d_elastica_end_moment_rolls_up() {
    let (l, iz) = (4.0, 1e-5);
    let ei = E * 1000.0 * iz;
    let n_el = 24;
    for phi in [1.0, 0.75 * std::f64::consts::PI, 1.5 * std::f64::consts::PI] {
        let m = phi * ei / l;
        let nodes: Vec<_> = (0..=n_el).map(|k| (k + 1, l * k as f64 / n_el as f64, 0.0)).collect();
        let elems = (1..=n_el).map(|k| (k, "frame", k, k + 1, 1, 1, false, false)).collect();
        let input = make_input(
            nodes,
            vec![(1, E, 0.3)],
            vec![(1, 0.01, iz)], // no axial force under an end moment: the arc keeps its length
            elems,
            vec![(1, 1, "fixed")],
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: n_el + 1, fx: 0.0, fz: 0.0, my: m })],
        );
        let r = corotational::solve_corotational_2d(&input, 60, 1e-8, 30, false).unwrap();
        assert!(r.converged, "φ = {phi}: not converged");
        let d = disp2(&r.results, n_el + 1);
        close(d.ry.abs(), phi, 1e-6, &format!("φ = {phi}: tip rotation"));
        // The chord polygon of a circle: 24 elements put the tip within ~1e-3 L.
        let (x, z) = (l + d.ux, d.uz.abs());
        assert!((x - l * phi.sin() / phi).abs() < 2e-3 * l, "φ = {phi}: tip x {x} vs {}", l * phi.sin() / phi);
        assert!((z - l * (1.0 - phi.cos()) / phi).abs() < 2e-3 * l, "φ = {phi}: tip z {z} vs {}", l * (1.0 - phi.cos()) / phi);
    }
}

// ======================================================================
// 3D co-rotational frame element
// ======================================================================

fn rotate(q: &[[f64; 3]; 3], v: [f64; 3]) -> [f64; 3] {
    [0, 1, 2].map(|i| q[i][0] * v[0] + q[i][1] * v[1] + q[i][2] * v[2])
}

/// Rotation matrix of the rotation vector `t` (Rodrigues).
fn rot_matrix(t: [f64; 3]) -> [[f64; 3]; 3] {
    let a = (t[0] * t[0] + t[1] * t[1] + t[2] * t[2]).sqrt();
    let k = t.map(|x| x / a);
    let (c, s) = (a.cos(), a.sin());
    let mut r = [[0.0; 3]; 3];
    let skew = [[0.0, -k[2], k[1]], [k[2], 0.0, -k[0]], [-k[1], k[0], 0.0]];
    for i in 0..3 {
        for j in 0..3 {
            r[i][j] = (if i == j { c } else { 0.0 }) + s * skew[i][j] + (1.0 - c) * k[i] * k[j];
        }
    }
    r
}

/// 3D cantilever of `n_el` members from the origin along `dir` (unit), fixed at
/// node 1, tip loads `f` and `m` (global). Doubly symmetric section (Iy = Iz),
/// so the result cannot depend on how the local y axis is chosen.
fn cantilever_3d(dir: [f64; 3], f: [f64; 3], m: [f64; 3]) -> SolverInput3D {
    let (l, n_el) = (3.0, 6);
    let nodes = (0..=n_el).map(|k| {
        let s = l * k as f64 / n_el as f64;
        (k + 1, s * dir[0], s * dir[1], s * dir[2])
    }).collect();
    let elems = (1..=n_el).map(|k| (k, "frame", k, k + 1, 1, 1)).collect();
    make_3d_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, 0.01, 2e-5, 2e-5, 3e-5)],
        elems,
        vec![(1, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: n_el + 1, fx: f[0], fy: f[1], fz: f[2], mx: m[0], my: m[1], mz: m[2], bw: None,
        })],
    )
}

/// Frame invariance (objectivity) of the 3D co-rotational solver: the same
/// cantilever and loads turned by a rotation Q must give Q times the
/// displacements and Q times the rotation vectors. Loads in both bending
/// planes plus torsion take the tip ~0.5 rad out of any plane.
#[test]
fn nl_corot3d_solution_is_frame_invariant() {
    let (f, m) = ([0.0, 240.0, -360.0], [160.0, 0.0, 0.0]);
    let base = corotational::solve_corotational_3d(&cantilever_3d([1.0, 0.0, 0.0], f, m), 60, 1e-10, 20, false).unwrap();
    assert!(base.converged);
    let tip = disp3(&base.results, 7);
    let rot_tip = (tip.rx * tip.rx + tip.ry * tip.ry + tip.rz * tip.rz).sqrt();
    assert!(rot_tip > 0.3, "the test needs large rotations, tip rotation {rot_tip}");
    for q in [[0.3, -0.5, 0.8], [0.0, 0.0, 1.2], [-1.0, 0.4, 0.2]] {
        let q = rot_matrix(q);
        let input = cantilever_3d(rotate(&q, [1.0, 0.0, 0.0]), rotate(&q, f), rotate(&q, m));
        let r = corotational::solve_corotational_3d(&input, 60, 1e-10, 20, false).unwrap();
        assert!(r.converged);
        for k in 2..=7 {
            let (a, b) = (disp3(&base.results, k), disp3(&r.results, k));
            let ut = rotate(&q, [a.ux, a.uy, a.uz]);
            let rt = rotate(&q, [a.rx, a.ry, a.rz]);
            for (x, y, w) in [(ut[0], b.ux, "ux"), (ut[1], b.uy, "uy"), (ut[2], b.uz, "uz"), (rt[0], b.rx, "rx"), (rt[1], b.ry, "ry"), (rt[2], b.rz, "rz")] {
                assert!((x - y).abs() < 1e-6, "node {k} {w}: rotated base {x} vs rotated model {y}");
            }
        }
    }
}

// ======================================================================
// P-Delta against the closed form and against linear buckling
// ======================================================================

/// Cantilever column, axial P = 0.6·Pcr and tip shear H. Exact second-order
/// tip deflection (beam-column): δ = H·(tan μL − μL)/(P·μ), μ² = P/EI. The
/// P-Delta solve (consistent Kg, 8 members) must reproduce it, and the first
/// buckling factor of the same model under P alone must be π²EI/(4L²P).
#[test]
fn nl_pdelta_matches_beam_column_and_buckling() {
    let (l, iz, n_el) = (5.0, 2e-5, 8);
    let ei = E * 1000.0 * iz;
    let pcr = std::f64::consts::PI.powi(2) * ei / (4.0 * l * l);
    let p = 0.6 * pcr;
    let h = 2.0;
    let build = |h: f64| {
        let nodes = (0..=n_el).map(|k| (k + 1, 0.0, l * k as f64 / n_el as f64)).collect();
        let elems = (1..=n_el).map(|k| (k, "frame", k, k + 1, 1, 1, false, false)).collect();
        make_input(nodes, vec![(1, E, 0.3)], vec![(1, 0.05, iz)], elems, vec![(1, 1, "fixed")],
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: n_el + 1, fx: h, fz: -p, my: 0.0 })])
    };
    let r = pdelta::solve_pdelta_2d(&build(h), 100, 1e-12).unwrap();
    assert!(r.converged && r.is_stable);
    let mu = (p / ei).sqrt();
    let exact = h * ((mu * l).tan() - mu * l) / (p * mu);
    // The axial shortening reduces N slightly from P; 8 cubic members are
    // within 1e-4 of the continuum.
    close(disp2(&r.results, n_el + 1).ux, exact, 2e-3, "P-Delta tip deflection vs beam-column");
    let b = buckling::solve_buckling_2d(&build(0.0), 1).unwrap();
    close(b.modes[0].load_factor, pcr / p, 1e-3, "buckling factor vs Euler");
}

// ======================================================================
// 3D co-rotational with released members (docs/verification/SYMBOLIC.md, item 5)
// ======================================================================

/// A Gerber beam: member 1 fixed at its base and pinned (released) at node 2,
/// member 2 continuous from node 2 to a roller: in 3D the rotation of node 2
/// is held only by member 2. Small load: the co-rotational answer must be the
/// linear one.
#[test]
fn nl_corot3d_released_member_small_load_matches_linear() {
    let nodes = vec![(1, 0.0, 0.0, 0.0), (2, 3.0, 0.0, 0.0), (3, 6.0, 0.0, 0.0)];
    let elems = vec![(1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1)];
    let mut input = make_3d_input(
        nodes,
        vec![(1, E, 0.3)],
        vec![(1, 0.01, 2e-5, 2e-5, 3e-5)],
        elems,
        vec![(1, vec![true; 6]), (3, vec![false, true, true, false, false, false])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 0.0, fy: 0.0, fz: -0.01, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );
    {
        let e = input.elements.get_mut("1").unwrap();
        e.release_my_end = true;
        e.release_mz_end = true;
    }
    let lin = linear::solve_3d(&input).unwrap();
    let r = corotational::solve_corotational_3d(&input, 50, 1e-10, 1, false).unwrap();
    assert!(r.converged, "not converged");
    close(disp3(&r.results, 2).uz, disp3(&lin, 2).uz, 1e-4, "uz at the hinge");
}


// ======================================================================
// Lumped-plasticity "material nonlinear" solver
// ======================================================================

const A_SEC: f64 = 0.045;
const IZ_SEC: f64 = 3.375e-4;
const MP: f64 = 843.75;
const NP: f64 = 11_250.0;

fn material_nl_2d(solver: SolverInput, n_increments: usize) -> NonlinearMaterialInput {
    NonlinearMaterialInput {
        solver,
        material_models: HashMap::from([("1".into(), MaterialModel { model_type: "elastic_perfectly_plastic".into(), fy: 250.0, alpha: Some(0.01) })]),
        section_capacities: HashMap::from([("1".into(), SectionCapacity { np: NP, mp: MP, zp: None })]),
        max_iter: 50,
        tolerance: 1e-8,
        n_increments,
    }
}

/// Statically determinate cantilever (4 m, 4 members) under a tip load 1.2·Mp/L:
/// the base moment is P·L whatever the stiffness. The reported member end
/// moment must equal it and the base reaction.
#[test]
fn nl_material_2d_member_forces_balance_the_reactions() {
    let (l, p) = (4.0, 1.2 * MP / 4.0);
    let solver = make_beam(4, l, E, A_SEC, IZ_SEC, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: -p, my: 0.0 })]);
    let r = dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_2d(&material_nl_2d(solver, 10)).unwrap();
    assert!(r.converged);
    let base = r.results.reactions.iter().find(|x| x.node_id == 1).unwrap();
    close(base.my.abs(), p * l, 1e-6, "base reaction moment = P·L");
    let ef = r.results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    close(ef.m_start.abs(), p * l, 1e-3, "member 1 start moment vs P·L");
    // Utilization from the same forces: M/Mp = 1.2 (it read ~120 from K_el·u).
    let st = r.element_status.iter().find(|s| s.element_id == 1).unwrap();
    close(st.utilization, 1.2, 1e-3, "member 1 utilization vs P·L/Mp");
}

/// The same cantilever with a temperature gradient on every member: statically determinate, so
/// the base moment is still P·L, and the yielded members' end moments must equal it. Recovering
/// through the reduced section alone recomputed the thermal fixed-end moment with α·EI (Codex
/// review of #510).
#[test]
fn nl_material_2d_member_forces_keep_the_assembled_thermal_loads() {
    let (l, p) = (4.0, 1.2 * MP / 4.0);
    let mut loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: -p, my: 0.0 })];
    for e in 1..=4 {
        loads.push(SolverLoad::Thermal(SolverThermalLoad { element_id: e, dt_uniform: 0.0, dt_gradient: 40.0, alpha: None, depth: None }));
    }
    let solver = make_beam(4, l, E, A_SEC, IZ_SEC, "fixed", None, loads);
    let r = dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_2d(&material_nl_2d(solver, 10)).unwrap();
    assert!(r.converged);
    let base = r.results.reactions.iter().find(|x| x.node_id == 1).unwrap();
    close(base.my.abs(), p * l, 1e-6, "base reaction moment = P·L");
    let ef = r.results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    close(ef.m_start.abs(), p * l, 1e-3, "member 1 start moment vs P·L with a thermal gradient");
}

/// Just past first yield the response of a hardening hinge is continuous: a
/// load 1% above the yield load deflects a cantilever about 1% more than a load
/// 1% below it. The solver replaces EI by α·EI over the whole yielded member
/// (secant), so the deflection jumps by about 1/α.
#[test]
#[ignore = "open question NL-5: yielding replaces EI by alpha*EI over the whole member (secant), the load-deflection curve jumps at first yield"]
fn nl_material_2d_response_is_continuous_at_first_yield() {
    let l = 4.0;
    let tip = |p: f64| {
        let solver = make_beam(4, l, E, A_SEC, IZ_SEC, "fixed", None,
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: -p, my: 0.0 })]);
        let r = dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_2d(&material_nl_2d(solver, 20)).unwrap();
        assert!(r.converged);
        disp2(&r.results, 5).uz.abs()
    };
    let py = MP / l;
    let (below, above) = (tip(0.99 * py), tip(1.01 * py));
    assert!(above / below < 1.2, "tip deflection jumps from {below} to {above} (x{:.1}) across first yield", above / below);
}

/// The same section, the same planar forces (N = 0.5·Np, M = 0.7·Mp, both
/// below the yield surface) must give the same utilization in the 2D and in
/// the 3D solver. 2D uses (N/Np)² + |M|/Mp (= 0.95); 3D used
/// (N/Np)² + (My/Mpy)² + (Mz/Mpz)² (= 0.74) until NL-6 (#429).
#[test]
fn nl_material_2d_and_3d_use_the_same_yield_surface() {
    let (n, m) = (0.5 * NP, 0.7 * MP);
    let s2 = make_input(vec![(1, 0.0, 0.0), (2, 2.0, 0.0)], vec![(1, E, 0.3)], vec![(1, A_SEC, IZ_SEC)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)], vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: -n, fz: 0.0, my: m })]);
    let r2 = dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_2d(&material_nl_2d(s2, 1)).unwrap();
    let s3 = make_3d_input(vec![(1, 0.0, 0.0, 0.0), (2, 2.0, 0.0, 0.0)], vec![(1, E, 0.3)],
        vec![(1, A_SEC, IZ_SEC, IZ_SEC, 2.0 * IZ_SEC)], vec![(1, "frame", 1, 2, 1, 1)], vec![(1, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: -n, fy: 0.0, fz: 0.0, mx: 0.0, my: m, mz: 0.0, bw: None })]);
    let in3 = NonlinearMaterialInput3D {
        solver: s3,
        material_models: HashMap::from([("1".into(), MaterialModel { model_type: "elastic_perfectly_plastic".into(), fy: 250.0, alpha: Some(0.01) })]),
        section_capacities: HashMap::from([("1".into(), SectionCapacity3D { np: NP, mpy: MP, mpz: MP, mpx: None })]),
        max_iter: 50, tolerance: 1e-8, n_increments: 1,
    };
    let r3 = dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_3d(&in3).unwrap();
    let (u2, u3) = (r2.element_status[0].utilization, r3.element_status[0].utilization);
    close(u2, 0.25 + 0.7, 1e-6, "2D utilization");
    close(u3, u2, 1e-6, "3D utilization vs 2D");
}

/// 3D material-nonlinear cantilever along x (L = 4 m, 4 members, Iy = Iz,
/// Mpy = Mpz = Mp) with a tip load. Determinate, so the base moment is the
/// load times L whatever the stiffness.
fn material_nl_3d_cantilever(fy: f64, fz: f64, fx: f64, my: f64, mz: f64, n_increments: usize) -> NonlinearMaterialResult3D {
    let l = 4.0;
    let nodes: Vec<_> = (0..=4).map(|i| (i + 1, i as f64 * l / 4.0, 0.0, 0.0)).collect();
    let elems: Vec<_> = (1..=4).map(|i| (i, "frame", i, i + 1, 1, 1)).collect();
    let s3 = make_3d_input(nodes, vec![(1, E, 0.3)], vec![(1, A_SEC, IZ_SEC, IZ_SEC, 2.0 * IZ_SEC)], elems,
        vec![(1, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 5, fx, fy, fz, mx: 0.0, my, mz, bw: None })]);
    let input = NonlinearMaterialInput3D {
        solver: s3,
        material_models: HashMap::from([("1".into(), MaterialModel { model_type: "elastic_perfectly_plastic".into(), fy: 250.0, alpha: Some(0.01) })]),
        section_capacities: HashMap::from([("1".into(), SectionCapacity3D { np: NP, mpy: MP, mpz: MP, mpx: None })]),
        max_iter: 50, tolerance: 1e-8, n_increments,
    };
    let r = dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_3d(&input).unwrap();
    assert!(r.converged);
    r
}

fn status3(r: &NonlinearMaterialResult3D, id: usize) -> &ElementPlasticStatus3D {
    r.element_status.iter().find(|s| s.element_id == id).unwrap()
}

/// A 3D cantilever bent about either axis under an axial force N = 0.5·Np
/// yields at the load the 2D cantilever does: P·L = (1 − 0.25)·Mp, so
/// Py = 0.75·Mp/L. At 0.99·Py the base member is elastic in both, at 1.01·Py
/// it has yielded in both, and the base utilization is 0.25 + 0.75·P/Py in
/// both. The circle yielded at P·L = √0.75·Mp, 15% later.
#[test]
fn nl_material_3d_uniaxial_yields_at_the_2d_load() {
    let l = 4.0;
    let n = 0.5 * NP;
    let py = 0.75 * MP / l;
    for f in [0.99, 1.01] {
        let p = f * py;
        let s2 = make_beam(4, l, E, A_SEC, IZ_SEC, "fixed", None,
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: -n, fz: -p, my: 0.0 })]);
        let r2 = dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_2d(&material_nl_2d(s2, 1)).unwrap();
        assert!(r2.converged);
        let st2 = r2.element_status.iter().find(|s| s.element_id == 1).unwrap();
        close(st2.utilization, 0.25 + 0.75 * f, 1e-6, "2D base utilization");
        assert_eq!(st2.state == "elastic", f < 1.0, "2D state {} at {f}·Py", st2.state);
        for (fy, fz) in [(0.0, -p), (-p, 0.0)] {
            let r3 = material_nl_3d_cantilever(fy, fz, -n, 0.0, 0.0, 1);
            let st3 = status3(&r3, 1);
            close(st3.utilization, st2.utilization, 1e-6, &format!("3D (fy {fy}, fz {fz}) vs 2D utilization at {f}·Py"));
            assert_eq!(st3.state == "elastic", st2.state == "elastic",
                "3D (fy {fy}, fz {fz}) is {} and 2D is {} at {f}·Py", st3.state, st2.state);
        }
    }
}

/// Biaxial bending yields no later than the uniaxial limits imply: a tip
/// moment of 0.6·Mp about each axis is 1.2 of the chord between the two
/// uniaxial plastic moments and must yield. The circle
/// (My/Mpy)² + (Mz/Mpz)² gave 0.72 and kept it elastic.
#[test]
fn nl_material_3d_biaxial_yields_no_later_than_the_uniaxial_limits() {
    let m = 0.6 * MP;
    let r = material_nl_3d_cantilever(0.0, 0.0, 0.0, m, m, 1);
    for id in 1..=4 {
        let st = status3(&r, id);
        assert_ne!(st.state, "elastic", "member {id} under My = Mz = 0.6·Mp");
        close(st.utilization, 1.2, 1e-6, &format!("member {id} utilization |My|/Mpy + |Mz|/Mpz"));
    }
}

/// Hand calculation of the reported utilization with all three resultants:
/// N = 0.3·Np, My = 0.4·Mp, Mz = 0.2·Mp at every section of a cantilever
/// under an end axial force and end moments:
/// (0.3)² + 0.4 + 0.2 = 0.69, elastic.
#[test]
fn nl_material_3d_utilization_matches_hand_calculation() {
    let r = material_nl_3d_cantilever(0.0, 0.0, 0.3 * NP, 0.4 * MP, 0.2 * MP, 1);
    for id in 1..=4 {
        let st = status3(&r, id);
        assert_eq!(st.state, "elastic", "member {id}");
        close(st.utilization, 0.09 + 0.4 + 0.2, 1e-6, &format!("member {id} utilization"));
    }
}

// ======================================================================
// Fiber solver (global loop)
// ======================================================================

use dedaliano_engine::element::fiber_beam::{rectangular_fiber_section, FiberMaterial};
use dedaliano_engine::solver::fiber_nonlinear::{solve_fiber_nonlinear_2d, FiberNonlinearInput};

const FB: f64 = 0.1;
const FH: f64 = 0.2;
const FY: f64 = 250.0;

fn fiber_input(solver: SolverInput, n_increments: usize, modified_nr: bool) -> FiberNonlinearInput {
    FiberNonlinearInput {
        solver,
        fiber_sections: HashMap::from([(
            "1".into(),
            rectangular_fiber_section(FB, FH, 200, FiberMaterial::SteelBilinear { e: E, fy: FY, hardening_ratio: 0.0 }),
        )]),
        n_integration_points: 5,
        // Modified Newton contracts by ~0.9 per iteration on this problem.
        max_iter: if modified_nr { 1000 } else { 200 },
        tolerance: 1e-10,
        n_increments,
        modified_nr,
    }
}

fn fiber_cantilever(l: f64, n_el: usize, my: f64, fz: f64) -> SolverInput {
    make_beam(n_el, l, E, FB * FH, FB * FH.powi(3) / 12.0, "fixed", None,
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: n_el + 1, fx: 0.0, fz, my })])
}

/// Uniform moment on an elastic-perfectly-plastic rectangle: the section's
/// moment-curvature law is κ/κy = 1/√(3 − 2M/My) for My ≤ M < Mp, and the
/// displacement-based fiber element is exact for uniform curvature, so the
/// tip rotation of a cantilever under an end moment is κ·L. The answer of a
/// monotonic load must not depend on how many increments reach it.
#[test]
fn nl_fiber_end_moment_matches_section_law() {
    let l = 2.0;
    let my_el = FY * 1000.0 * FB * FH * FH / 6.0;
    let m = 1.4 * my_el; // Mp = 1.5·My
    let kappa_y = FY / (E * FH / 2.0);
    let exact = kappa_y / (3.0 - 2.0 * 1.4f64).sqrt() * l;
    for (inc, mnr) in [(1, false), (20, false), (1, true)] {
        let r = solve_fiber_nonlinear_2d(&fiber_input(fiber_cantilever(l, 2, m, 0.0), inc, mnr)).unwrap();
        assert!(r.converged, "{inc} increments, mnr {mnr}: not converged");
        // 200 layers: the discrete section is within ~1e-4 of the continuum.
        close(disp2(&r.results, 3).ry.abs(), exact, 2e-3, &format!("{inc} increments, mnr {mnr}: tip rotation"));
    }
}

/// The member forces of the fiber solve are the fiber section resultants:
/// a cantilever under a tip moment past first yield has M = applied moment in
/// every member. They were the elastic K·u of the displacements.
#[test]
fn nl_fiber_member_forces_are_section_resultants() {
    let l = 2.0;
    let my_el = FY * 1000.0 * FB * FH * FH / 6.0;
    let m = 1.4 * my_el;
    let r = solve_fiber_nonlinear_2d(&fiber_input(fiber_cantilever(l, 2, m, 0.0), 10, false)).unwrap();
    assert!(r.converged);
    for ef in &r.results.element_forces {
        close(ef.m_start.abs(), m, 1e-6, &format!("member {} m_start", ef.element_id));
        close(ef.m_end.abs(), m, 1e-6, &format!("member {} m_end", ef.element_id));
    }
}

/// Path dependence of the committed state: a propped cantilever loaded past
/// first yield in one increment must reach the state it reaches in many
/// (monotonic loading; backward-Euler steps from the last converged state).
#[test]
fn nl_fiber_one_increment_matches_many() {
    let l = 4.0;
    let mp = FY * 1000.0 * FB * FH * FH / 4.0;
    let p = 0.95 * 6.0 * mp / l; // collapse load of a propped cantilever, central load: 6Mp/L
    let solver = make_beam(4, l, E, FB * FH, FB * FH.powi(3) / 12.0, "fixed", Some("rollerX"),
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -p, my: 0.0 })]);
    let many = solve_fiber_nonlinear_2d(&fiber_input(solver.clone(), 40, false)).unwrap();
    let one = solve_fiber_nonlinear_2d(&fiber_input(solver, 1, false)).unwrap();
    assert!(many.converged && one.converged);
    let (a, b) = (disp2(&many.results, 3).uz, disp2(&one.results, 3).uz);
    eprintln!("propped cantilever midspan: 40 increments {a}, 1 increment {b}");
    close(b, a, 2e-2, "midspan deflection, 1 vs 40 increments");
}

// ======================================================================
// Line search, imperfections
// ======================================================================

/// The Armijo condition needs the slope of E(α) = ½‖R(u + αΔu)‖² at α = 0,
/// which is −Rᵀ·K_T·Δu (= −‖R‖² for the Newton step). The helper returns
/// −R·Δu, the slope of the potential energy, which has other units.
#[test]
#[ignore = "open question NL-8: line_search::directional_derivative is -R.du, not the slope of 0.5*|R|^2"]
fn nl_line_search_slope_is_the_derivative_of_the_residual_energy() {
    use dedaliano_engine::solver::line_search::{directional_derivative, residual_energy};
    // R(u) = f − k·u with k = 3, f = 2: Newton step Δu = R/k.
    let (k, f, u0) = (3.0, 2.0, 0.1);
    let r = |u: f64| vec![f - k * u];
    let du = r(u0)[0] / k;
    let h = 1e-6;
    let fd = (residual_energy(&r(u0 + h * du), 1) - residual_energy(&r(u0 - h * du), 1)) / (2.0 * h);
    close(directional_derivative(&r(u0), &[du], 1), fd, 1e-6, "slope at α = 0");
}

/// Notional loads in 3D: with the defaults (Z up, ADR 0001) a column carrying
/// 100 kN of gravity gets ratio·100 kN laterally. The default gravity axis is
/// 1, which is Z in 2D but Y in 3D, so the 3D default reads gravity from F_y.
#[test]
#[ignore = "open question NL-9: NotionalLoadDef.gravity_axis defaults to 1 = Y in 3D, so default 3D notional loads are empty"]
fn nl_notional_loads_3d_default_gravity_is_z() {
    use dedaliano_engine::solver::imperfections::notional_loads_3d;
    let input = make_3d_input(vec![(1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, 3.0)], vec![(1, E, 0.3)],
        vec![(1, 0.01, 1e-5, 1e-5, 2e-5)], vec![(1, "frame", 1, 2, 1, 1)], vec![(1, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 0.0, fy: 0.0, fz: -100.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })]);
    let def: NotionalLoadDef = serde_json::from_str(r#"{"ratio": 0.005}"#).unwrap();
    let loads = notional_loads_3d(&input, &def);
    let fx: f64 = loads.iter().map(|l| match l { SolverLoad3D::Nodal(n) => n.fx, _ => 0.0 }).sum();
    close(fx, 0.5, 1e-9, "notional lateral load");
}

/// Notional loads are a fraction of the gravity load the structure carries:
/// a beam whose gravity is a member load gets none.
#[test]
#[ignore = "open question NL-10: notional loads read only nodal loads; member (distributed/point) gravity loads are ignored"]
fn nl_notional_loads_include_member_gravity_loads() {
    use dedaliano_engine::solver::imperfections::notional_loads_2d;
    let input = make_input(vec![(1, 0.0, 3.0), (2, 6.0, 3.0)], vec![(1, E, 0.3)], vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)], vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::Distributed(SolverDistributedLoad { element_id: 1, q_i: -10.0, q_j: -10.0, a: None, b: None })]);
    let def: NotionalLoadDef = serde_json::from_str(r#"{"ratio": 0.005}"#).unwrap();
    let fx: f64 = notional_loads_2d(&input, &def).iter().map(|l| match l { SolverLoad::Nodal(n) => n.fx, _ => 0.0 }).sum();
    close(fx, 0.005 * 60.0, 1e-9, "notional load of 60 kN of gravity");
}

/// A residual stress set into a fiber state has to survive the first strain
/// evaluation: at zero strain the fiber must still carry it. The helpers
/// store it as a strain the material law overwrites.
#[test]
#[ignore = "open question NL-11: residual-stress helpers set a transient strain; the stress is gone at the next material call"]
fn nl_residual_stress_survives_the_first_evaluation() {
    use dedaliano_engine::element::fiber_beam::{material_response, SectionState};
    use dedaliano_engine::solver::imperfections::apply_uniform_residual_stress;
    let mat = FiberMaterial::SteelBilinear { e: E, fy: FY, hardening_ratio: 0.01 };
    let section = rectangular_fiber_section(FB, FH, 4, mat.clone());
    let mut states = vec![SectionState::new(4)];
    apply_uniform_residual_stress(&section, &mut states, -75.0);
    let (sigma, _) = material_response(&mat, 0.0, &mut states[0].fiber_states[0]);
    close(sigma, -75.0, 1e-9, "fiber stress at zero strain after a −75 MPa residual stress");
}
