//! The draft nonlinear framework (src/nonlinear): large displacements and
//! nonlinear materials through one driver. Checked against closed forms, and
//! against the existing solvers, which stay as they are and serve as oracles.
use crate::common;

use common::*;
use dedaliano_engine::element::fiber_beam::FiberMaterial;
use dedaliano_engine::nonlinear::*;
use dedaliano_engine::solver::{corotational, linear};
use dedaliano_engine::types::*;
use std::f64::consts::PI;

// ==================== Helpers ====================

/// A cantilever along +x from the origin, `n` frames, fixed at node 0. The
/// basic response of each element comes from `basic(l)`.
fn cantilever(
    n: usize,
    l: f64,
    kin: Kinematics,
    basic: &dyn Fn(f64) -> Box<dyn BasicResponse2D>,
) -> (Model2D, usize) {
    let mut m = Model2D::new();
    let nodes: Vec<usize> = (0..=n).map(|i| m.add_node(l * i as f64 / n as f64, 0.0)).collect();
    m.fix(nodes[0], [true, true, true]);
    for w in nodes.windows(2) {
        let (i, j) = (w[0], w[1]);
        let le = l / n as f64;
        let e = Frame2D::new(m.frame_dofs(i, j), m.coords(i), m.coords(j), kin, basic(le)).unwrap();
        m.add_element(Box::new(e));
    }
    (m, nodes[n])
}

fn elastic(ea: f64, ei: f64) -> impl Fn(f64) -> Box<dyn BasicResponse2D> {
    move |l| Box::new(ElasticBasic2D::new(ea, ei, l)) as Box<dyn BasicResponse2D>
}

fn tip(out: &Outcome, m: &Model2D, node: usize) -> [f64; 3] {
    [out.u[m.dof(node, 0)], out.u[m.dof(node, 1)], out.u[m.dof(node, 2)]]
}

/// The two-bar (von Mises) truss: supports at (±a, 0), apex at (0, h), a
/// downward reference load of 1 at the apex.
fn von_mises_truss(a: f64, h: f64, ea: f64) -> (Model2D, usize) {
    let mut m = Model2D::new();
    let left = m.add_node(-a, 0.0);
    let right = m.add_node(a, 0.0);
    let apex = m.add_node(0.0, h);
    m.fix(left, [true, true, true]);
    m.fix(right, [true, true, true]);
    m.fix(apex, [false, false, true]);
    for s in [left, right] {
        let e = Truss2D::new(m.truss_dofs(s, apex), m.coords(s), m.coords(apex), Kinematics::Corotational, 1.0, Box::new(Elastic1D::new(ea)))
            .unwrap();
        m.add_element(Box::new(e));
    }
    m.add_load(apex, [0.0, -1.0, 0.0]);
    (m, apex)
}

/// Downward apex load that holds the apex at a downward displacement `w`.
fn von_mises_load(a: f64, h: f64, ea: f64, w: f64) -> f64 {
    let l0 = (a * a + h * h).sqrt();
    let l = (a * a + (h - w) * (h - w)).sqrt();
    2.0 * ea * (l0 - l) / l0 * (h - w) / l
}

// ==================== Against the existing solvers ====================

/// Small displacements, elastic: the framework's linear kinematics
/// reproduces the linear solver.
#[test]
fn linear_kinematics_elastic_frame_matches_the_linear_solver() {
    let (e_mpa, a, iz, l, n) = (200_000.0, 0.01, 1e-4, 3.0, 4);
    let (fx, fz) = (5.0, 10.0);
    let e = e_mpa * 1000.0;
    let (mut m, end) = cantilever(n, l, Kinematics::Linear, &elastic(e * a, e * iz));
    m.add_load(end, [fx, fz, 0.0]);
    let out = solve(&mut m, &Strategy::LoadControl { target: 1.0, increments: 1 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed());

    let nodes = (0..=n).map(|i| (i + 1, l * i as f64 / n as f64, 0.0)).collect();
    let elems = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
    let input = make_input(
        nodes,
        vec![(1, e_mpa, 0.3)],
        vec![(1, a, iz)],
        elems,
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx, fz, my: 0.0 })],
    );
    let lin = linear::solve_2d(&input).unwrap();
    let d = lin.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let t = tip(&out, &m, end);
    assert_close(t[0], d.ux, 1e-9, "ux");
    assert_close(t[1], d.uz, 1e-9, "uz");
    // The engine's rotation DOF turns the same way, from +x toward +z.
    assert_close(t[2], d.ry, 1e-9, "θ");
}

/// Large displacements, elastic: the framework's co-rotational frame
/// reproduces the existing co-rotational solver.
#[test]
fn corotational_elastic_cantilever_matches_the_existing_corotational_solver() {
    let (e_mpa, a, iz, l, n) = (200_000.0, 1.0, 1e-4, 2.0, 16);
    let e = e_mpa * 1000.0;
    let p = 5.0 * e * iz / (l * l); // PL²/EI = 5
    let (mut m, end) = cantilever(n, l, Kinematics::Corotational, &elastic(e * a, e * iz));
    m.add_load(end, [0.0, p, 0.0]);
    let out = solve(&mut m, &Strategy::LoadControl { target: 1.0, increments: 20 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed());

    let nodes = (0..=n).map(|i| (i + 1, l * i as f64 / n as f64, 0.0)).collect();
    let elems = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
    let input = make_input(
        nodes,
        vec![(1, e_mpa, 0.3)],
        vec![(1, a, iz)],
        elems,
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: 0.0, fz: p, my: 0.0 })],
    );
    let old = corotational::solve_corotational_2d(&input, 50, 1e-10, 20, false).unwrap();
    assert!(old.converged);
    let d = old.results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let t = tip(&out, &m, end);
    assert_close(t[0], d.ux, 1e-6, "ux");
    assert_close(t[1], d.uz, 1e-6, "uz");
    assert_close(t[2], d.ry, 1e-6, "θ");
}

// ==================== Closed forms: large displacements ====================

/// An end moment M bends an elastic cantilever into a circle of radius
/// EI/M. At M = 1.5π·EI/L the tip turns 270° and sits at (−R, R).
#[test]
fn end_moment_rolls_a_cantilever_into_three_quarters_of_a_circle() {
    let (l, ei, n) = (1.0, 1.0, 40);
    let (mut m, end) = cantilever(n, l, Kinematics::Corotational, &elastic(1e7, ei));
    let theta = 1.5 * PI;
    m.add_load(end, [0.0, 0.0, theta * ei / l]);
    let out = solve(&mut m, &Strategy::LoadControl { target: 1.0, increments: 30 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed(), "{:?}", out.termination);
    let r = l / theta;
    let t = tip(&out, &m, end);
    // Chords on the arc: an O((L/nR)²) shortening of the polygon.
    assert!((l + t[0] - (-r)).abs() < 2e-3 * l, "x = {}", l + t[0]);
    assert!((t[1] - r).abs() < 2e-3 * l, "z = {}", t[1]);
    assert!((t[2] - theta).abs() < 1e-7, "θ = {}", t[2]);
}

/// The elastica of a cantilever under a tip load P (Mattiasson 1981):
/// tip deflection w/L and shortening u/L for PL²/EI = 1, 2, 5, 10.
#[test]
fn cantilever_tip_load_follows_mattiasson_elastica() {
    let (l, ei, n) = (1.0, 1.0, 20);
    let (mut m, end) = cantilever(n, l, Kinematics::Corotational, &elastic(1e8, ei));
    m.add_load(end, [0.0, 1.0, 0.0]);
    let out = solve(&mut m, &Strategy::LoadControl { target: 10.0, increments: 40 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed());
    for (k, w_ref, u_ref) in [(1.0, 0.30172, 0.05643), (2.0, 0.49346, 0.16064), (5.0, 0.71379, 0.38763), (10.0, 0.81061, 0.55500)] {
        let s = out.steps.iter().find(|s| (s.lambda - k).abs() < 1e-9).expect("a step at this load");
        let (u, w) = (-s.u[m.dof(end, 0)], s.u[m.dof(end, 1)]);
        assert!((w - w_ref).abs() < 1e-3, "PL²/EI = {k}: w/L = {w}, Mattiasson {w_ref}");
        assert!((u - u_ref).abs() < 1e-3, "PL²/EI = {k}: u/L = {u}, Mattiasson {u_ref}");
    }
}

/// The two-bar truss snaps through: displacement control follows the whole
/// load–deflection curve, including its falling branch and the negative
/// loads past the flat position.
#[test]
fn displacement_control_follows_the_snap_through_of_a_two_bar_truss() {
    let (a, h, ea) = (1.0, 0.2, 1000.0);
    let (mut m, apex) = von_mises_truss(a, h, ea);
    let dof = m.dof(apex, 1);
    let out = solve(&mut m, &Strategy::DisplacementControl { dof, target: -2.0 * h, increments: 80 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed(), "{:?}", out.termination);
    let p_max = (0..=1000).map(|i| von_mises_load(a, h, ea, h * i as f64 / 1000.0)).fold(0.0, f64::max);
    let mut saw_negative = false;
    for s in &out.steps {
        let w = -s.u[dof];
        let expected = von_mises_load(a, h, ea, w);
        assert!((s.lambda - expected).abs() < 1e-8 * p_max, "w = {w}: λ = {}, closed form {expected}", s.lambda);
        saw_negative |= s.lambda < -0.1 * p_max;
    }
    assert!(saw_negative, "the path never reached the inverted branch");
    assert!((out.lambda).abs() < 1e-8 * p_max, "at w = 2h the bars are back at their length");
}

/// Load control cannot pass the limit point. The driver stops there, says
/// so, and reports the last converged state, not the iterate that failed nor
/// the distant branch Newton can land on past the peak. Whether or not a step
/// lands exactly on the peak.
#[test]
fn load_control_past_a_limit_point_stops_with_the_last_converged_state() {
    let (a, h, ea) = (1.0, 0.2, 1000.0);
    let p_max = (0..=10000).map(|i| von_mises_load(a, h, ea, h * i as f64 / 10000.0)).fold(0.0, f64::max);
    for increments in [15, 16, 23, 7] {
        let (mut m, apex) = von_mises_truss(a, h, ea);
        let out = solve(&mut m, &Strategy::LoadControl { target: 1.5 * p_max, increments }, &NewtonOptions::default()).unwrap();
        let Termination::Stopped { reason, message } = &out.termination else {
            panic!("{increments} increments: completed, λ = {}", out.lambda);
        };
        assert_eq!(*reason, StopReason::LimitPoint, "{increments} increments: {message}");
        assert!(out.lambda <= p_max * (1.0 + 1e-6) && out.lambda > 0.9 * p_max, "{increments} increments: λ = {}, P_max = {p_max}", out.lambda);
        let w = -out.u[m.dof(apex, 1)];
        assert!(w < h, "{increments} increments: still on the near branch, w = {w}");
        assert!((out.lambda - von_mises_load(a, h, ea, w)).abs() < 1e-8 * p_max, "the reported state is in equilibrium");
        assert_eq!(out.steps.last().unwrap().lambda, out.lambda);
    }
}

// ==================== Nonlinear material ====================

const FY: f64 = 250e3; // kN/m²
const E_STEEL: f64 = 2e8; // kN/m²

fn steel_epp() -> FiberLaw1D {
    FiberLaw1D::new(FiberMaterial::SteelBilinear { e: E_STEEL, fy: FY, hardening_ratio: 0.0 })
}

fn fiber_basic(b: f64, h: f64) -> impl Fn(f64) -> Box<dyn BasicResponse2D> {
    let section = FiberSection2D::rectangle(b, h, 40, &steel_epp());
    move |l| Box::new(FiberBasic2D::new(l, &section, 5)) as Box<dyn BasicResponse2D>
}

/// A steel cantilever, small displacements: elastic stiffness 3EI/L³, then
/// a plastic hinge at the support at P = Mp/L. Displacement-based elements
/// cannot follow the curvature that concentrates at the hinge, so they
/// overestimate the collapse load, by an error that halves with the element
/// size; the extrapolated load is Mp/L.
#[test]
fn plastic_cantilever_converges_to_its_collapse_load() {
    let (l, b, h) = (1.0, 0.1, 0.2);
    let i = b * h * h * h / 12.0;
    let p_y = FY * b * h * h / 6.0 / l;
    let delta_y = p_y * l.powi(3) / (3.0 * E_STEEL * i);
    let p_c = FY * b * h * h / 4.0 / l;
    let collapse = |n: usize| -> f64 {
        let (mut m, end) = cantilever(n, l, Kinematics::Linear, &fiber_basic(b, h));
        m.add_load(end, [0.0, 1.0, 0.0]);
        let dof = m.dof(end, 1);
        let out = solve(&mut m, &Strategy::DisplacementControl { dof, target: 40.0 * delta_y, increments: 40 }, &NewtonOptions::default()).unwrap();
        assert!(out.completed(), "{:?}", out.termination);
        if n == 10 {
            let first = &out.steps[0];
            assert_close(first.lambda / first.u[dof], 3.0 * E_STEEL * i / l.powi(3), 2e-3, "elastic stiffness");
            assert!(out.steps.windows(2).all(|w| w[1].lambda >= w[0].lambda - 1e-9 * p_c), "monotone toward the plateau");
        }
        out.lambda
    };
    let (p10, p20) = (collapse(10), collapse(20));
    assert!(p10 > p20 && p20 > p_c, "from above: {p10}, {p20}, Mp/L = {p_c}");
    let ratio = (p10 - p_c) / (p20 - p_c);
    assert!((ratio - 2.0).abs() < 0.2, "first-order convergence: error ratio {ratio}");
    let extrapolated = 2.0 * p20 - p10;
    assert!((extrapolated - p_c).abs() < 5e-3 * p_c, "extrapolated {extrapolated}, Mp/L = {p_c}");
}

/// The same cantilever under large displacements: as the tip swings in, the
/// lever arm shortens and the load the hinge carries rises. Equilibrium on
/// the deformed shape holds exactly: M_support = P·(L + u_x).
#[test]
fn plastic_cantilever_under_large_displacement_keeps_equilibrium_on_the_deformed_shape() {
    let (l, b, h) = (1.0, 0.1, 0.2);
    let (mut m, end) = cantilever(10, l, Kinematics::Corotational, &fiber_basic(b, h));
    m.add_load(end, [0.0, 1.0, 0.0]);
    let dof = m.dof(end, 1);
    let out = solve(&mut m, &Strategy::DisplacementControl { dof, target: 0.5 * l, increments: 100 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed(), "{:?}", out.termination);

    let p_c = FY * b * h * h / 4.0 / l;
    let ux = out.u[m.dof(end, 0)];
    assert!(ux < -0.05 * l, "the tip swung in: ux = {ux}");
    assert!(out.lambda > 1.05 * p_c, "the shorter lever arm carries more: λ = {}, Mp/L = {p_c}", out.lambda);
    let m_support = out.reactions[m.dof(0, 2)].abs();
    assert_close(m_support, out.lambda * (l + ux), 1e-6, "M_support = P·(L + u_x)");
    // Within the same displacement-based overestimate as the small-displacement
    // cantilever with 10 elements (about 3.5 %).
    let mp = FY * b * h * h / 4.0;
    assert!(m_support > mp && m_support < 1.05 * mp, "M_support = {m_support}, Mp = {mp}");
}

// ==================== Tangents ====================

/// Every element tangent is the derivative of its internal force: central
/// differences agree, elastic and partly yielded, small and large rotation.
#[test]
fn element_tangents_match_finite_differences() {
    // Hardening keeps every fiber's response smooth between its own kinks.
    let steel = FiberLaw1D::new(FiberMaterial::SteelBilinear { e: E_STEEL, fy: FY, hardening_ratio: 0.02 });
    let section = FiberSection2D::rectangle(0.1, 0.2, 21, &steel);
    let (xi, xj) = ([0.0, 0.0], [0.6, 0.8]);
    // A rigid rotation φ of the element, plus end rotations and a stretch
    // in its own frame. The curvature at yield of this section is
    // 2·fy/(E·h) = 0.0125.
    let state = |phi: f64, th1: f64, th2: f64, stretch: f64| -> [f64; 6] {
        let (c, s) = (phi.cos(), phi.sin());
        let (dx, dz) = ((xj[0] - xi[0]) * (1.0 + stretch), (xj[1] - xi[1]) * (1.0 + stretch));
        let (x, z) = (c * dx - s * dz, s * dx + c * dz);
        [0.0, 0.0, phi + th1, x - (xj[0] - xi[0]), z - (xj[1] - xi[1]), phi + th2]
    };
    let cases = [
        (Kinematics::Linear, false, state(0.0, 0.003, -0.001, 2e-4)),
        (Kinematics::Corotational, false, state(1.1, 0.003, -0.001, 2e-4)),
        (Kinematics::Linear, true, state(0.0, 0.012, -0.004, 4e-4)),
        (Kinematics::Corotational, true, state(1.1, 0.012, -0.004, 4e-4)),
    ];
    for (kin, plastic, u) in cases {
        let make = || -> Frame2D {
            let basic: Box<dyn BasicResponse2D> =
                if plastic { Box::new(FiberBasic2D::new(1.0, &section, 5)) } else { Box::new(ElasticBasic2D::new(2e6, 1e3, 1.0)) };
            Frame2D::new([0, 1, 2, 3, 4, 5], xi, xj, kin, basic).unwrap()
        };
        let mut e = make();
        e.update(&u).unwrap();
        let k = e.tangent().to_vec();
        let scale = k.iter().fold(0.0f64, |a, x| a.max(x.abs()));
        assert!(scale > 0.0);
        for j in 0..6 {
            let d = 1e-8;
            let (mut up, mut um) = (u, u);
            up[j] += d;
            um[j] -= d;
            let mut ep = make();
            ep.update(&up).unwrap();
            let mut em = make();
            em.update(&um).unwrap();
            for i in 0..6 {
                let fd = (ep.internal_force()[i] - em.internal_force()[i]) / (2.0 * d);
                assert!((fd - k[6 * i + j]).abs() < 1e-5 * scale, "{kin:?}, plastic {plastic}: K[{i}][{j}] = {}, FD {fd}", k[6 * i + j]);
            }
        }
    }
}

// ==================== Plane-stress J2 ====================

fn j2(h_ratio: f64) -> PlaneStressJ2 {
    PlaneStressJ2::new(E_STEEL, 0.3, FY, h_ratio * E_STEEL)
}

fn von_mises(s: [f64; 3]) -> f64 {
    (s[0] * s[0] - s[0] * s[1] + s[1] * s[1] + 3.0 * s[2] * s[2]).sqrt()
}

/// Equal biaxial strain gives equal biaxial stress, which yields at fy; pure
/// shear yields at fy/√3.
#[test]
fn j2_yields_on_the_von_mises_surface() {
    let nu: f64 = 0.3;
    let eps_y = FY * (1.0 - nu) / E_STEEL;
    let mut m = j2(0.0);
    m.set_trial_strain([0.9 * eps_y, 0.9 * eps_y, 0.0]).unwrap();
    assert_close(m.stress()[0], 0.9 * FY, 1e-12, "elastic biaxial");
    m.set_trial_strain([3.0 * eps_y, 3.0 * eps_y, 0.0]).unwrap();
    assert_close(m.stress()[0], FY, 1e-9, "plastic biaxial");
    assert_close(m.stress()[1], FY, 1e-9, "plastic biaxial");

    let g = E_STEEL / (2.0 * (1.0 + nu));
    let gamma_y = FY / 3f64.sqrt() / g;
    let mut m = j2(0.0);
    m.set_trial_strain([0.0, 0.0, 4.0 * gamma_y]).unwrap();
    assert_close(m.stress()[2], FY / 3f64.sqrt(), 1e-9, "plastic shear");
    assert!(m.stress()[0].abs() < 1e-6 * FY && m.stress()[1].abs() < 1e-6 * FY);
}

/// After a plastic step the stress sits on the hardened surface, and the
/// tangent is the derivative of the stress (consistent tangent), for
/// perfect and hardening plasticity, on a general strain.
#[test]
fn j2_return_mapping_and_its_consistent_tangent() {
    for h_ratio in [0.0, 0.001, 0.05] {
        let base = [0.004, -0.0012, 0.0031];
        let mut m = j2(h_ratio);
        m.set_trial_strain(base).unwrap();
        let s = m.stress();
        let kappa = FY + h_ratio * E_STEEL * m.equivalent_plastic_strain();
        assert!(m.equivalent_plastic_strain() > 0.0);
        assert_close(von_mises(s), kappa, 1e-9, "on the yield surface");

        let ct = m.tangent();
        for j in 0..3 {
            let d = 1e-9;
            let (mut ep, mut em) = (base, base);
            ep[j] += d;
            em[j] -= d;
            let mut mp = j2(h_ratio);
            mp.set_trial_strain(ep).unwrap();
            let mut mm = j2(h_ratio);
            mm.set_trial_strain(em).unwrap();
            for i in 0..3 {
                let fd = (mp.stress()[i] - mm.stress()[i]) / (2.0 * d);
                assert!((fd - ct[3 * i + j]).abs() < 1e-5 * E_STEEL, "H/E = {h_ratio}: C[{i}][{j}] = {}, FD {fd}", ct[3 * i + j]);
            }
        }
    }
}

/// Unloading from a plastic state is elastic, and only a committed state
/// carries plastic strain into the next step.
#[test]
fn j2_unloads_elastically_and_keeps_only_committed_state() {
    let mut m = j2(0.01);
    let loaded = [0.005, 0.0, 0.0];
    m.set_trial_strain(loaded).unwrap();
    let s_loaded = m.stress();
    m.commit();
    let back = [0.0045, 0.0, 0.0];
    m.set_trial_strain(back).unwrap();
    let c = PlaneStressElastic::new(E_STEEL, 0.3).tangent();
    for i in 0..3 {
        let expected = s_loaded[i] + c[3 * i] * (back[0] - loaded[0]);
        assert_close(m.stress()[i] + 1.0, expected + 1.0, 1e-9, "elastic unloading");
    }
    // Revert, and a fresh trial from the committed state.
    m.revert();
    let mut fresh = j2(0.01);
    fresh.set_trial_strain(loaded).unwrap();
    fresh.commit();
    fresh.set_trial_strain(back).unwrap();
    m.set_trial_strain(back).unwrap();
    assert_eq!(m.stress(), fresh.stress());
}


// ==================== Robust strategies ====================

/// The two-bar truss loaded through a soft spring above the apex: the
/// load–deflection curve of the loaded point turns back (snap-back), which
/// displacement control cannot follow and arc-length does. Every step is on
/// the closed form: λ = P(w) at the apex and v = w + λ/k at the loaded point.
#[test]
fn arc_length_follows_a_snap_back() {
    let (a, h, ea) = (1.0, 0.2, 1000.0);
    let slope_min = (0..=2000)
        .map(|i| {
            let w = 2.0 * h * i as f64 / 2000.0;
            (von_mises_load(a, h, ea, w + 1e-6) - von_mises_load(a, h, ea, w - 1e-6)) / 2e-6
        })
        .fold(f64::INFINITY, f64::min);
    let k = 0.5 * -slope_min; // softer than the truss's steepest fall: snap-back
    let p_max = (0..=10000).map(|i| von_mises_load(a, h, ea, h * i as f64 / 10000.0)).fold(0.0, f64::max);

    let build = || {
        let (mut m, apex) = von_mises_truss(a, h, ea);
        // Move the load from the apex to a node above it, on a spring.
        m.add_load(apex, [0.0, 1.0, 0.0]);
        let top = m.add_node(0.0, h + 1.0);
        m.fix(top, [true, false, true]);
        let spring = Truss2D::new(m.truss_dofs(apex, top), m.coords(apex), m.coords(top), Kinematics::Linear, 1.0, Box::new(Elastic1D::new(k))).unwrap();
        m.add_element(Box::new(spring));
        m.add_load(top, [0.0, -1.0, 0.0]);
        (m, apex, top)
    };

    let (mut m, apex, top) = build();
    let out = solve(&mut m, &Strategy::ArcLength { target: 1.2 * p_max, increments: 20, max_steps: 600 }, &NewtonOptions::default()).unwrap();
    assert!(out.branch_switches.is_empty(), "a limit point is not a bifurcation: {:?}", out.branch_switches);
    assert!(!out.critical_points.is_empty());
    for c in &out.critical_points {
        assert_eq!(c.kind, CriticalKind::LimitPoint, "λ = {}, alignment {}", c.lambda, c.load_alignment);
        assert!(c.load_alignment > 0.1);
    }
    assert!(out.completed(), "{:?} at λ = {}", out.termination, out.lambda);
    let mut turned_back = false;
    let mut v_prev = 0.0;
    let mut v_max = 0.0f64;
    for s in &out.steps {
        let (w, v) = (-s.u[m.dof(apex, 1)], -s.u[m.dof(top, 1)]);
        assert!((s.lambda - von_mises_load(a, h, ea, w)).abs() < 1e-7 * p_max, "λ = {} at w = {w}", s.lambda);
        assert!((v - (w + s.lambda / k)).abs() < 1e-8, "spring: v = {v}, w + λ/k = {}", w + s.lambda / k);
        v_max = v_max.max(v);
        turned_back |= v < v_prev - 1e-3 * h && v < v_max - 1e-3 * h;
        v_prev = v;
    }
    assert!(turned_back, "the loaded point never moved back: no snap-back traced");
    assert!(w_final(&out, &m, apex) > 2.0 * h, "ended on the inverted branch");
    assert_close(out.lambda, 1.2 * p_max, 1e-9, "ends on the target load");

    // Displacement control of the loaded point cannot pass the snap-back.
    let (mut m, _, top) = build();
    let dof = m.dof(top, 1);
    let dc = solve(&mut m, &Strategy::DisplacementControl { dof, target: -3.0 * h, increments: 60 }, &NewtonOptions::default()).unwrap();
    // It stops: by the jump check if Newton lands on the far branch, or by the
    // divergence check if it is caught heading there.
    let Termination::Stopped { reason, .. } = &dc.termination else { panic!("displacement control got through a snap-back") };
    assert!(matches!(reason, StopReason::LimitPoint | StopReason::NoConvergence), "{reason:?}");
    let w = -dc.u[m.dof(top, 1)];
    assert!(w < 2.0 * h, "it stopped before the snap-back, not past it");
}

fn w_final(out: &Outcome, m: &Model2D, apex: usize) -> f64 {
    -out.u[m.dof(apex, 1)]
}

/// The robust default goes through the snap-through that stops load control:
/// load control up to the limit point, arc-length past it, and the target
/// load reached on the far branch, every step on the closed form.
#[test]
fn auto_strategy_passes_the_limit_point_that_stops_load_control() {
    let (a, h, ea) = (1.0, 0.2, 1000.0);
    let p_max = (0..=10000).map(|i| von_mises_load(a, h, ea, h * i as f64 / 10000.0)).fold(0.0, f64::max);
    let (mut m, apex) = von_mises_truss(a, h, ea);
    let out = solve(&mut m, &Strategy::Auto { target: 1.5 * p_max, increments: 15, max_steps: 400 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed(), "{:?}", out.termination);
    assert_close(out.lambda, 1.5 * p_max, 1e-9, "the target load");
    assert!(w_final(&out, &m, apex) > 2.0 * h, "on the far branch");
    assert!(out.steps.iter().any(|s| s.phase == Phase::LoadControl));
    assert!(out.steps.iter().any(|s| s.phase == Phase::ArcLength));
    for s in &out.steps {
        let w = -s.u[m.dof(apex, 1)];
        assert!((s.lambda - von_mises_load(a, h, ea, w)).abs() < 1e-7 * p_max, "λ = {} at w = {w}", s.lambda);
    }
}

/// The LDLᵀ inertia marks the unstable branch: one negative eigenvalue
/// exactly where the truss's load falls with deflection, none elsewhere.
#[test]
fn inertia_marks_the_unstable_branch() {
    let (a, h, ea) = (1.0, 0.2, 1000.0);
    let (mut m, apex) = von_mises_truss(a, h, ea);
    let dof = m.dof(apex, 1);
    let out = solve(&mut m, &Strategy::DisplacementControl { dof, target: -2.5 * h, increments: 100 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed());
    let mut seen_unstable = false;
    for s in &out.steps {
        let w = -s.u[dof];
        let slope = (von_mises_load(a, h, ea, w + 1e-6) - von_mises_load(a, h, ea, w - 1e-6)) / 2e-6;
        if slope.abs() < 1.0 {
            continue; // at a limit point
        }
        let expected = if slope < 0.0 { 1 } else { 0 };
        assert_eq!(s.negative_eigenvalues, Some(expected), "w = {w}, dP/dw = {slope}");
        seen_unstable |= expected == 1;
        assert_eq!(s.method, FactorMethod::Ldlt);
    }
    assert!(seen_unstable);
}

/// Asked for the whole elastica (PL²/EI = 10) in one load step, the driver
/// gets there by itself: Newton, then line search, then cuts.
#[test]
fn one_large_load_step_reaches_the_elastica() {
    let (l, ei, n) = (1.0, 1.0, 20);
    let (mut m, end) = cantilever(n, l, Kinematics::Corotational, &elastic(1e8, ei));
    m.add_load(end, [0.0, 1.0, 0.0]);
    let out = solve(&mut m, &Strategy::Auto { target: 10.0, increments: 1, max_steps: 100 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed(), "{:?}", out.termination);
    let (u, w) = (-out.u[m.dof(end, 0)], out.u[m.dof(end, 1)]);
    assert!((w - 0.81061).abs() < 1e-3 && (u - 0.55500).abs() < 1e-3, "w/L = {w}, u/L = {u}");
}

// ==================== Planned rungs ====================

/// K(k) and E(k), complete elliptic integrals, by the arithmetic–geometric mean.
fn elliptic_ke(k: f64) -> (f64, f64) {
    let (mut a, mut b, mut c) = (1.0f64, (1.0 - k * k).sqrt(), k);
    let mut sum = 0.5 * c * c;
    let mut pow = 0.5;
    for _ in 0..30 {
        let (a1, b1) = ((a + b) / 2.0, (a * b).sqrt());
        c = (a - b) / 2.0;
        pow *= 2.0;
        sum += pow * c * c;
        a = a1;
        b = b1;
    }
    let kk = std::f64::consts::PI / (2.0 * a);
    (kk, kk * (1.0 - sum))
}

/// A perfect cantilever column under axial load buckles at
/// P_cr = π²EI/(4L²): a bifurcation, with the critical mode orthogonal to the
/// load. Auto meets it, switches to the buckled branch along that mode, and
/// follows Euler's elastica: at P/P_cr = (2K(k)/π)², the tip deflects
/// 2kL/K(k) sideways and drops 2L(1 − E(k)/K(k)). Without branch switching
/// it stays on the straight, unstable path.
#[test]
fn branch_switching_follows_the_buckled_column() {
    let (l, ei, n) = (1.0, 1.0, 20);
    let p_cr = PI * PI * ei / (4.0 * l * l);
    let build = || {
        let mut m = Model2D::new();
        let nodes: Vec<usize> = (0..=n).map(|i| m.add_node(0.0, l * i as f64 / n as f64)).collect();
        m.fix(nodes[0], [true, true, true]);
        for w in nodes.windows(2) {
            let e = Frame2D::new(m.frame_dofs(w[0], w[1]), m.coords(w[0]), m.coords(w[1]), Kinematics::Corotational, Box::new(ElasticBasic2D::new(1e8, ei, l / n as f64)))
                .unwrap();
            m.add_element(Box::new(e));
        }
        m.add_load(nodes[n], [0.0, -1.0, 0.0]);
        (m, nodes[n])
    };
    let ratio: f64 = 1.1;
    let (mut lo, mut hi) = (1e-9, 1.0 - 1e-12);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if (2.0 * elliptic_ke(mid).0 / PI).powi(2) < ratio { lo = mid } else { hi = mid }
    }
    let k = 0.5 * (lo + hi);
    let (kk, ek) = elliptic_ke(k);

    let (mut m, top) = build();
    let out = solve(&mut m, &Strategy::Auto { target: ratio * p_cr, increments: 10, max_steps: 300 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed(), "{:?}", out.termination);
    assert_eq!(out.branch_switches.len(), 1, "{:?}", out.branch_switches);
    assert!((out.branch_switches[0] / p_cr - 1.0).abs() < 0.05, "switched at λ = {}, P_cr = {p_cr}", out.branch_switches[0]);
    let (ux, uz) = (out.u[m.dof(top, 0)], out.u[m.dof(top, 1)]);
    assert!((ux.abs() / l - 2.0 * k / kk).abs() < 0.01 * 2.0 * k / kk, "sideways {} vs elastica {}", ux.abs() / l, 2.0 * k / kk);
    let drop = 2.0 * (1.0 - ek / kk);
    assert!((-uz / l - drop).abs() < 0.02 * drop, "drop {} vs elastica {drop}", -uz / l);
    assert_eq!(out.steps.last().unwrap().negative_eigenvalues, Some(0), "the buckled branch is stable");

    let (mut m, top) = build();
    let opts = NewtonOptions { branch_switching: false, ..NewtonOptions::default() };
    let out = solve(&mut m, &Strategy::Auto { target: ratio * p_cr, increments: 10, max_steps: 300 }, &opts).unwrap();
    assert!(out.completed());
    assert!(out.u[m.dof(top, 0)].abs() < 1e-9, "without switching the column stays straight");
    assert_eq!(out.steps.last().unwrap().negative_eigenvalues, Some(1), "on the unstable primary path");
}

/// Modified Newton and BFGS reach the same states as full Newton with fewer
/// factorizations.
#[test]
fn modified_newton_and_bfgs_agree_with_fewer_factorizations() {
    let (l, b, h) = (1.0, 0.1, 0.2);
    let p_c = FY * b * h * h / 4.0 / l;
    let run = |iteration: Iteration| {
        let (mut m, end) = cantilever(10, l, Kinematics::Linear, &fiber_basic(b, h));
        m.add_load(end, [0.0, 1.0, 0.0]);
        let opts = NewtonOptions { iteration, max_iterations: 200, ..NewtonOptions::default() };
        // Two large steps: full Newton needs several iterations each, which is
        // where reusing a factorization pays.
        let out = solve(&mut m, &Strategy::LoadControl { target: 0.95 * p_c, increments: 2 }, &opts).unwrap();
        assert!(out.completed(), "{iteration:?}: {:?}", out.termination);
        (out.u[m.dof(end, 1)], out.factorizations)
    };
    let (u_full, f_full) = run(Iteration::Full);
    for it in [Iteration::Modified { refactor_every: 1000 }, Iteration::Bfgs { pairs: 10 }] {
        let (u, f) = run(it);
        assert!((u - u_full).abs() < 1e-6 * u_full.abs(), "{it:?}: {u} vs {u_full}");
        assert!(f < f_full, "{it:?}: {f} factorizations, full Newton {f_full}");
    }
}

/// The energy criterion and the moment scaling change how convergence is
/// measured, not where the path goes.
#[test]
fn convergence_measures_do_not_move_the_answer() {
    let solve_with = |opts: NewtonOptions| {
        let (mut m, end) = cantilever(20, 1.0, Kinematics::Corotational, &elastic(1e8, 1.0));
        m.add_load(end, [0.0, 3.0, 2.0]);
        let out = solve(&mut m, &Strategy::LoadControl { target: 1.0, increments: 10 }, &opts).unwrap();
        assert!(out.completed(), "{:?}", out.termination);
        [out.u[m.dof(end, 0)], out.u[m.dof(end, 1)], out.u[m.dof(end, 2)]]
    };
    let base = solve_with(NewtonOptions::default());
    for opts in [
        NewtonOptions { energy_tolerance: Some(1e-24), ..NewtonOptions::default() },
        NewtonOptions { rotation_length: Some(1e-3), ..NewtonOptions::default() },
        NewtonOptions { rotation_length: Some(1e3), ..NewtonOptions::default() },
    ] {
        let u = solve_with(opts.clone());
        for c in 0..3 {
            assert!((u[c] - base[c]).abs() < 1e-7 * (1.0 + base[c].abs()), "{opts:?}: {u:?} vs {base:?}");
        }
    }
}

/// The spherical arc-length constraint follows the same snap-back.
#[test]
fn spherical_arc_length_follows_the_snap_back() {
    let (a, h, ea) = (1.0, 0.2, 1000.0);
    let p_max = (0..=10000).map(|i| von_mises_load(a, h, ea, h * i as f64 / 10000.0)).fold(0.0, f64::max);
    let k = 0.5 * 4000.0; // well inside the snap-back range for this truss
    let (mut m, apex) = von_mises_truss(a, h, ea);
    m.add_load(apex, [0.0, 1.0, 0.0]);
    let top = m.add_node(0.0, h + 1.0);
    m.fix(top, [true, false, true]);
    m.add_element(Box::new(Truss2D::new(m.truss_dofs(apex, top), m.coords(apex), m.coords(top), Kinematics::Linear, 1.0, Box::new(Elastic1D::new(k))).unwrap()));
    m.add_load(top, [0.0, -1.0, 0.0]);
    let opts = NewtonOptions { arc_psi: 1e-3, ..NewtonOptions::default() };
    let out = solve(&mut m, &Strategy::ArcLength { target: 1.2 * p_max, increments: 20, max_steps: 600 }, &opts).unwrap();
    assert!(out.completed(), "{:?}", out.termination);
    for s in &out.steps {
        let w = -s.u[m.dof(apex, 1)];
        assert!((s.lambda - von_mises_load(a, h, ea, w)).abs() < 1e-7 * p_max, "λ = {} at w = {w}", s.lambda);
    }
}

// ==================== Buckling modes ====================

/// Euler's elastica for a cantilever column: k with P/P_cr = (2K(k)/π)².
fn elastica_k(ratio: f64) -> f64 {
    let (mut lo, mut hi) = (1e-9, 1.0 - 1e-12);
    for _ in 0..200 {
        let mid = 0.5 * (lo + hi);
        if (2.0 * elliptic_ke(mid).0 / PI).powi(2) < ratio { lo = mid } else { hi = mid }
    }
    0.5 * (lo + hi)
}

/// Cantilever columns standing at the given x, loaded down at their tops.
fn columns(xs: &[f64], ei: f64, n: usize) -> (Model2D, Vec<usize>) {
    let mut m = Model2D::new();
    let mut tops = Vec::new();
    for &x in xs {
        let nodes: Vec<usize> = (0..=n).map(|i| m.add_node(x, i as f64 / n as f64)).collect();
        m.fix(nodes[0], [true, true, true]);
        for w in nodes.windows(2) {
            let e = Frame2D::new(m.frame_dofs(w[0], w[1]), m.coords(w[0]), m.coords(w[1]), Kinematics::Corotational, Box::new(ElasticBasic2D::new(1e5, ei, 1.0 / n as f64)))
                .unwrap();
            m.add_element(Box::new(e));
        }
        m.add_load(nodes[n], [0.0, -1.0, 0.0]);
        tops.push(nodes[n]);
    }
    (m, tops)
}

/// Two identical, independent columns buckle at the same load: a double
/// eigenvalue. The critical point reports multiplicity 2 and two modes
/// orthogonal to the load; whatever combination the driver follows, each
/// column ends either straight or on Euler's elastica.
#[test]
fn a_double_critical_load_has_two_modes() {
    let p_cr = PI * PI / 4.0;
    let (mut m, tops) = columns(&[0.0, 1.0], 1.0, 16);
    let out = solve(&mut m, &Strategy::Auto { target: 1.1 * p_cr, increments: 10, max_steps: 300 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed(), "{:?}", out.termination);
    let c = &out.critical_points[0];
    assert_eq!(c.kind, CriticalKind::Bifurcation);
    assert_eq!(c.multiplicity, 2, "{c:?}");
    assert_eq!(c.modes.len(), 2);
    assert!((c.lambda / p_cr - 1.0).abs() < 0.01, "λ_cr = {}", c.lambda);
    assert!(c.switched);
    let k = elastica_k(1.1);
    let delta = 2.0 * k / elliptic_ke(k).0;
    let mut buckled = 0;
    for &top in &tops {
        let ux = out.u[m.dof(top, 0)].abs();
        if ux > 0.5 * delta {
            assert!((ux - delta).abs() < 0.01 * delta, "a buckled column off the elastica: {ux} vs {delta}");
            buckled += 1;
        } else {
            assert!(ux < 1e-6, "neither straight nor on the elastica: {ux}");
        }
    }
    assert!(buckled >= 1);
}

/// Roorda's frame (an L of two equal members, pinned at both far ends, loaded
/// down the column at the rigid joint) bifurcates asymmetrically: the load
/// rises along one direction of the mode and falls along the other. The
/// critical load is the engine's linear buckling solver's.
#[test]
fn roorda_frame_bifurcates_asymmetrically() {
    // Members nearly inextensible (EA·L²/EI = 10⁹), as in Roorda's analysis: with a
    // shorter column the joint drops, the beam bends, and the primary path
    // rotates — an imperfect bifurcation.
    let (e_mpa, a, iz, l, n) = (1.0, 1e6, 1e-3, 1.0, 12);
    let (ea, ei) = (e_mpa * 1000.0 * a, e_mpa * 1000.0 * iz);
    let build = || {
        let mut m = Model2D::new();
        let col: Vec<usize> = (0..=n).map(|i| m.add_node(0.0, l * i as f64 / n as f64)).collect();
        let joint = col[n];
        let mut beam = vec![joint];
        beam.extend((1..=n).map(|i| m.add_node(l * i as f64 / n as f64, l)));
        m.fix(col[0], [true, true, false]);
        m.fix(beam[n], [true, true, false]);
        for line in [&col, &beam] {
            for w in line.windows(2) {
                let e = Frame2D::new(m.frame_dofs(w[0], w[1]), m.coords(w[0]), m.coords(w[1]), Kinematics::Corotational, Box::new(ElasticBasic2D::new(ea, ei, l / n as f64)))
                    .unwrap();
                m.add_element(Box::new(e));
            }
        }
        m.add_load(joint, [0.0, -1.0, 0.0]);
        (m, joint)
    };

    // The oracle: linear buckling of the same mesh.
    let mut nodes = Vec::new();
    for i in 0..=n {
        nodes.push((i + 1, 0.0, l * i as f64 / n as f64));
    }
    for i in 1..=n {
        nodes.push((n + 1 + i, l * i as f64 / n as f64, l));
    }
    let mut elems = Vec::new();
    for i in 0..n {
        elems.push((i + 1, "frame", i + 1, i + 2, 1, 1, false, false));
    }
    for i in 0..n {
        let from = if i == 0 { n + 1 } else { n + 1 + i };
        elems.push((n + i + 1, "frame", from, n + 2 + i, 1, 1, false, false));
    }
    let input = make_input(
        nodes,
        vec![(1, e_mpa, 0.3)],
        vec![(1, a, iz)],
        elems,
        vec![(1, 1, "pinned"), (2, 2 * n + 1, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: 0.0, fz: -1.0, my: 0.0 })],
    );
    let p_cr = dedaliano_engine::solver::buckling::solve_buckling_2d(&input, 1).unwrap().modes[0].load_factor;
    assert!((p_cr / (1.407 * PI * PI * ei / (l * l)) - 1.0).abs() < 0.01, "Roorda's P_cr ≈ 1.407·π²EI/L², the oracle gives {p_cr}");

    let mut slopes = Vec::new();
    for reverse in [false, true] {
        let (mut m, joint) = build();
        let opts = NewtonOptions { branch_reverse: reverse, ..NewtonOptions::default() };
        let out = solve(&mut m, &Strategy::ArcLength { target: 1.2 * p_cr, increments: 10, max_steps: 40 }, &opts).unwrap();
        let c = out.critical_points.iter().find(|c| c.kind == CriticalKind::Bifurcation).expect("a bifurcation");
        assert_eq!(c.multiplicity, 1);
        assert!((c.lambda / p_cr - 1.0).abs() < 0.02, "λ_cr = {}, linear buckling {p_cr}", c.lambda);
        let after: Vec<&StepRecord> = out.steps.iter().skip_while(|s| s.lambda != c.lambda).skip(1).take(3).collect();
        let s = after[2];
        let at_critical = out.steps.iter().find(|s| s.lambda == c.lambda).unwrap().u[m.dof(joint, 2)];
        let rotation = (s.u[m.dof(joint, 2)] - at_critical).abs();
        assert!(rotation > 1e-3, "left the primary path");
        let slope = (s.lambda - c.lambda) / rotation;
        // The falling branch is unstable, the rising one stable (Koiter).
        assert_eq!(s.negative_eigenvalues, Some(if slope < 0.0 { 1 } else { 0 }), "slope {slope}");
        slopes.push(slope);
    }
    assert!(slopes[0] * slopes[1] < 0.0, "one direction rises, the other falls: {slopes:?}");
    let ratio = (slopes[0] / slopes[1]).abs();
    assert!((0.3..3.0).contains(&ratio), "comparable slopes: {slopes:?}");
}

// ==================== Convergence and step control ====================

fn elastica_tip(opts: NewtonOptions, strategy: Strategy) -> (Outcome, [f64; 2]) {
    let (mut m, end) = cantilever(20, 1.0, Kinematics::Corotational, &elastic(1e8, 1.0));
    m.add_load(end, [0.0, 1.0, 0.0]);
    let out = solve(&mut m, &strategy, &opts).unwrap();
    let tip = [out.u[m.dof(end, 0)], out.u[m.dof(end, 1)]];
    (out, tip)
}

/// The displacement criterion is required alongside the force one: with a
/// loose force tolerance it still holds the answer to the tight one.
#[test]
fn the_displacement_criterion_holds_accuracy_when_the_force_one_is_loose() {
    let strategy = Strategy::LoadControl { target: 5.0, increments: 10 };
    let (_, reference) = elastica_tip(NewtonOptions::default(), strategy.clone());
    let loose_force = NewtonOptions { tolerance: 1e-3, energy_tolerance: None, ..NewtonOptions::default() };
    let (_, held) = elastica_tip(NewtonOptions { displacement_tolerance: 1e-9, ..loose_force.clone() }, strategy.clone());
    let (_, unheld) = elastica_tip(NewtonOptions { displacement_tolerance: 1e3, ..loose_force }, strategy);
    let err = |t: [f64; 2]| (t[0] - reference[0]).abs().max((t[1] - reference[1]).abs());
    assert!(err(held) < 1e-9, "held: {}", err(held));
    assert!(err(unheld) > 10.0 * err(held), "the force criterion alone stops earlier: {} vs {}", err(unheld), err(held));
}

/// An iteration budget stops the analysis on its last converged state.
#[test]
fn an_iteration_budget_stops_on_the_last_converged_state() {
    let opts = NewtonOptions { max_total_iterations: Some(12), ..NewtonOptions::default() };
    let (out, _) = elastica_tip(opts, Strategy::LoadControl { target: 5.0, increments: 10 });
    let Termination::Stopped { reason, .. } = &out.termination else { panic!("completed within 12 iterations") };
    assert_eq!(*reason, StopReason::IterationBudget);
    assert!(out.newton_iterations <= 12);
    assert_eq!(out.steps.last().map(|s| s.lambda), Some(out.lambda));
    assert!(out.lambda > 0.0 && out.lambda < 5.0);
}

/// A linear material that reports its tangent with the wrong sign: Newton
/// walks away from the solution, its residual growing every iteration — a
/// stand-in for any element whose tangent has gone bad.
#[derive(Clone)]
struct WrongTangent {
    e: f64,
    strain: f64,
}

impl UniaxialMaterial for WrongTangent {
    fn set_trial_strain(&mut self, strain: f64) {
        self.strain = strain;
    }
    fn stress(&self) -> f64 {
        self.e * self.strain
    }
    fn tangent(&self) -> f64 {
        -self.e
    }
    fn commit(&mut self) {}
    fn revert(&mut self) {}
    fn boxed_clone(&self) -> Box<dyn UniaxialMaterial> {
        Box::new(self.clone())
    }
}

/// With a diverging Newton, the check cuts each attempt after two growths of
/// the residual instead of spending all its iterations; both runs stop on the
/// same (initial) state.
#[test]
fn the_divergence_check_cuts_a_diverging_step_early() {
    let run = |divergence_check: bool| {
        let mut m = Model2D::new();
        let (a, b) = (m.add_node(0.0, 0.0), m.add_node(1.0, 0.0));
        m.fix(a, [true, true, true]);
        m.fix(b, [false, true, true]);
        let bar = Truss2D::new(m.truss_dofs(a, b), m.coords(a), m.coords(b), Kinematics::Linear, 1.0, Box::new(WrongTangent { e: 100.0, strain: 0.0 })).unwrap();
        m.add_element(Box::new(bar));
        m.add_load(b, [1.0, 0.0, 0.0]);
        let opts = NewtonOptions { divergence_check, line_search: false, extrapolate: false, max_cuts: 3, ..NewtonOptions::default() };
        solve(&mut m, &Strategy::LoadControl { target: 1.0, increments: 1 }, &opts).unwrap()
    };
    let (on, off) = (run(true), run(false));
    assert!(!on.completed() && !off.completed());
    assert_eq!((on.lambda, off.lambda), (0.0, 0.0));
    let Termination::Stopped { message, .. } = &on.termination else { unreachable!() };
    assert!(message.contains("grew"), "{message}");
    // Two growths and out, against the full 30 iterations, at each of 4 attempts.
    assert!(on.newton_iterations * 5 < off.newton_iterations, "with the check {}, without {}", on.newton_iterations, off.newton_iterations);
}

/// Starting each load step from the previous one extrapolated saves Newton
/// iterations along a smooth path, to the same answer.
#[test]
fn the_extrapolated_predictor_saves_iterations() {
    let strategy = Strategy::LoadControl { target: 10.0, increments: 40 };
    let (with, tip_with) = elastica_tip(NewtonOptions::default(), strategy.clone());
    let (without, tip_without) = elastica_tip(NewtonOptions { extrapolate: false, ..NewtonOptions::default() }, strategy);
    assert!(with.completed() && without.completed());
    assert!((tip_with[0] - tip_without[0]).abs() < 1e-8 && (tip_with[1] - tip_without[1]).abs() < 1e-8);
    assert!(with.newton_iterations < without.newton_iterations, "extrapolated {}, from the committed state {}", with.newton_iterations, without.newton_iterations);
}
