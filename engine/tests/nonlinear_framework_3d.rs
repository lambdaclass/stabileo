//! The draft nonlinear framework in 3D: frames and trusses with linear and
//! co-rotational kinematics, nodal rotations updated multiplicatively.
//! Checked against the existing 3D solvers, closed forms and the
//! Bathe–Bolourchi 45° bend.
use crate::common;

use common::*;
use dedaliano_engine::element::fiber_beam::FiberMaterial;
use dedaliano_engine::nonlinear::rotation::{self, exp, mat_mul, Mat3};
use dedaliano_engine::nonlinear::*;
use dedaliano_engine::solver::{corotational, linear};
use dedaliano_engine::types::*;
use std::f64::consts::PI;

const Z: [f64; 3] = [0.0, 0.0, 1.0];
const Y: [f64; 3] = [0.0, 1.0, 0.0];

fn elastic3d(ea: f64, gj: f64, eiy: f64, eiz: f64) -> impl Fn(f64) -> Box<dyn BasicResponse3D> {
    move |l| Box::new(ElasticBasic3D::new(ea, gj, eiy, eiz, l)) as Box<dyn BasicResponse3D>
}

/// Frames between consecutive points; the first node fully fixed.
fn polyline(points: &[[f64; 3]], reference: [f64; 3], kin: Kinematics, basic: &dyn Fn(f64) -> Box<dyn BasicResponse3D>) -> (Model3D, Vec<usize>) {
    let mut m = Model3D::new();
    let nodes: Vec<usize> = points.iter().map(|&p| m.add_node(p)).collect();
    m.fix(nodes[0], [true; 6]);
    for w in nodes.windows(2) {
        let (xi, xj) = (m.coords(w[0]), m.coords(w[1]));
        let l = ((xj[0] - xi[0]).powi(2) + (xj[1] - xi[1]).powi(2) + (xj[2] - xi[2]).powi(2)).sqrt();
        let e = Frame3D::new([w[0], w[1]], xi, xj, reference, kin, basic(l)).unwrap();
        m.add_element(Box::new(e));
    }
    (m, nodes)
}

fn straight(n: usize, l: f64) -> Vec<[f64; 3]> {
    (0..=n).map(|i| [l * i as f64 / n as f64, 0.0, 0.0]).collect()
}

fn dof6(out: &Outcome, m: &Model3D, node: usize) -> [f64; 6] {
    let mut d = [0.0; 6];
    for (k, x) in d.iter_mut().enumerate() {
        *x = out.u[m.dof(node, k)];
    }
    d
}

fn max_diff(a: &Mat3, b: &Mat3) -> f64 {
    (0..3).flat_map(|i| (0..3).map(move |j| (i, j))).map(|(i, j)| (a[i][j] - b[i][j]).abs()).fold(0.0, f64::max)
}

// ==================== Against the existing solvers ====================

/// Small displacements, elastic, loads in every direction on a space frame
/// (an L in plan, standing on a column): the linear 3D solver.
#[test]
fn linear_kinematics_space_frame_matches_the_linear_solver() {
    let (e_mpa, nu, a, i, j) = (200_000.0, 0.3, 0.01, 2e-5, 3e-5);
    let e = e_mpa * 1000.0;
    let g = e / (2.0 * (1.0 + nu));
    let pts = [[0.0, 0.0, 0.0], [0.0, 0.0, 3.0], [4.0, 0.0, 3.0], [4.0, 2.5, 3.0]];
    let mut m = Model3D::new();
    let nodes: Vec<usize> = pts.iter().map(|&p| m.add_node(p)).collect();
    m.fix(nodes[0], [true; 6]);
    let refs = [[1.0, 0.0, 0.0], Z, Z];
    for (k, w) in nodes.windows(2).enumerate() {
        let (xi, xj) = (m.coords(w[0]), m.coords(w[1]));
        let l = ((xj[0] - xi[0]).powi(2) + (xj[1] - xi[1]).powi(2) + (xj[2] - xi[2]).powi(2)).sqrt();
        let basic = Box::new(ElasticBasic3D::new(e * a, g * j, e * i, e * i, l));
        m.add_element(Box::new(Frame3D::new([w[0], w[1]], xi, xj, refs[k], Kinematics::Linear, basic).unwrap()));
    }
    let load = [3.0, -5.0, -8.0, 1.5, -2.0, 0.7];
    m.add_load(nodes[3], load);
    let out = solve(&mut m, &Strategy::LoadControl { target: 1.0, increments: 1 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed(), "{:?}", out.termination);

    let input = make_3d_input(
        pts.iter().enumerate().map(|(k, p)| (k + 1, p[0], p[1], p[2])).collect(),
        vec![(1, e_mpa, nu)],
        vec![(1, a, i, i, j)],
        (0..3).map(|k| (k + 1, "frame", k + 1, k + 2, 1, 1)).collect(),
        vec![(1, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 4, fx: load[0], fy: load[1], fz: load[2], mx: load[3], my: load[4], mz: load[5], bw: None })],
    );
    let lin = linear::solve_3d(&input).unwrap();
    for (k, &node) in nodes.iter().enumerate().skip(1) {
        let d = lin.displacements.iter().find(|d| d.node_id == k + 1).unwrap();
        let ours = dof6(&out, &m, node);
        for (c, (x, y)) in ours.iter().zip([d.ux, d.uy, d.uz, d.rx, d.ry, d.rz]).enumerate() {
            assert!((x - y).abs() < 1e-9 * (1.0 + y.abs()) + 1e-12, "node {} dof {c}: {x} vs {y}", k + 1);
        }
    }
}

/// Large displacements, elastic, a load with components along both
/// transverse axes: the existing 3D co-rotational solver.
#[test]
fn corotational_cantilever_matches_the_existing_3d_corotational_solver() {
    let (e_mpa, nu, a, i, j, l, n) = (200_000.0, 0.3, 0.02, 1e-4, 1.6e-4, 2.0, 12);
    let e = e_mpa * 1000.0;
    let g = e / (2.0 * (1.0 + nu));
    let p = 2.0 * e * i / (l * l);
    let (mut m, nodes) = polyline(&straight(n, l), Z, Kinematics::Corotational, &elastic3d(e * a, g * j, e * i, e * i));
    let end = nodes[n];
    m.add_load(end, [0.0, 0.6 * p, 0.8 * p, 0.0, 0.0, 0.0]);
    let out = solve(&mut m, &Strategy::LoadControl { target: 1.0, increments: 20 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed(), "{:?}", out.termination);

    let input = make_3d_beam(
        n,
        l,
        e_mpa,
        nu,
        a,
        i,
        i,
        j,
        vec![true; 6],
        None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: n + 1, fx: 0.0, fy: 0.6 * p, fz: 0.8 * p, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );
    let old = corotational::solve_corotational_3d(&input, 60, 1e-10, 20, false).unwrap();
    assert!(old.converged);
    let d = old.results.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
    let ours = dof6(&out, &m, end);
    let tip = (d.uy * d.uy + d.uz * d.uz).sqrt();
    for (c, (x, y)) in ours.iter().take(3).zip([d.ux, d.uy, d.uz]).enumerate() {
        assert!((x - y).abs() < 1e-4 * tip, "translation {c}: {x} vs {y}");
    }
}

// ==================== Closed forms ====================

/// An end moment about y rolls a cantilever into a circle in the x–z plane:
/// at θ = 270° the tip sits at (−R, ·, −R) and has turned by R_y(θ).
#[test]
fn end_moment_rolls_a_3d_cantilever_into_three_quarters_of_a_circle() {
    let (l, ei, n) = (1.0, 1.0, 40);
    let (mut m, nodes) = polyline(&straight(n, l), Z, Kinematics::Corotational, &elastic3d(1e7, 2.0, ei, ei));
    let end = nodes[n];
    let theta = 1.5 * PI;
    m.add_load(end, [0.0, 0.0, 0.0, 0.0, theta * ei / l, 0.0]);
    let out = solve(&mut m, &Strategy::LoadControl { target: 1.0, increments: 30 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed(), "{:?}", out.termination);
    let r = l / theta;
    let t = dof6(&out, &m, end);
    assert!((l + t[0] - (-r)).abs() < 2e-3 * l, "x = {}", l + t[0]);
    assert!(t[1].abs() < 1e-9, "y = {}", t[1]);
    assert!((t[2] - (-r)).abs() < 2e-3 * l, "z = {}", t[2]);
    assert!(max_diff(&m.rotation(end), &exp([0.0, theta, 0.0])) < 1e-6, "tip rotation");
}

/// A torque twists a straight bar by θ = T·L/GJ at any magnitude, here 270°.
#[test]
fn torque_twists_a_bar_by_any_angle() {
    let (l, gj, n) = (2.0, 3.0, 4);
    let (mut m, nodes) = polyline(&straight(n, l), Z, Kinematics::Corotational, &elastic3d(1e6, gj, 10.0, 10.0));
    let end = nodes[n];
    let theta = 1.5 * PI;
    m.add_load(end, [0.0, 0.0, 0.0, theta * gj / l, 0.0, 0.0]);
    let out = solve(&mut m, &Strategy::LoadControl { target: 1.0, increments: 12 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed(), "{:?}", out.termination);
    for (k, &node) in nodes.iter().enumerate() {
        let expected = exp([theta * k as f64 / n as f64, 0.0, 0.0]);
        assert!(max_diff(&m.rotation(node), &expected) < 1e-8, "node {k}");
    }
    let t = dof6(&out, &m, end);
    assert!(t[0].abs() < 1e-9 && t[1].abs() < 1e-9 && t[2].abs() < 1e-9, "twist alone moves nothing");
}

/// The 45° bend (Bathe & Bolourchi 1979): an eighth of a circle of radius
/// 100 in the x–y plane, tangent to y at the fixed end, loaded along z at
/// the free one. Tip positions from Simo & Vu-Quoc (1986).
#[test]
fn bathe_bolourchi_bend_matches_the_literature() {
    let r = 100.0;
    let (e, g) = (1e7, 5e6);
    let (a, i, j) = (1.0, 1.0 / 12.0, 1.0 / 6.0);
    // 32 straight frames on the arc.
    let fine: Vec<[f64; 3]> = (0..=32)
        .map(|k| {
            let phi = PI / 4.0 * k as f64 / 32.0;
            [r * (1.0 - phi.cos()), r * phi.sin(), 0.0]
        })
        .collect();
    let (mut m, nodes) = polyline(&fine, Z, Kinematics::Corotational, &elastic3d(e * a, g * j, e * i, e * i));
    let end = *nodes.last().unwrap();
    m.add_load(end, [0.0, 0.0, 1.0, 0.0, 0.0, 0.0]);
    let out = solve(&mut m, &Strategy::LoadControl { target: 600.0, increments: 60 }, &NewtonOptions::default()).unwrap();
    assert!(out.completed(), "{:?}", out.termination);
    let x0 = m.coords(end);
    for (p, reference) in [(300.0, [22.33, 58.84, 40.08]), (450.0, [18.62, 52.32, 48.39]), (600.0, [15.79, 47.23, 53.37])] {
        let s = out.steps.iter().find(|s| (s.lambda - p).abs() < 1e-9).expect("a step at this load");
        let tip = [x0[0] + s.u[m.dof(end, 0)], x0[1] + s.u[m.dof(end, 1)], x0[2] + s.u[m.dof(end, 2)]];
        for c in 0..3 {
            assert!((tip[c] - reference[c]).abs() < 0.5, "P = {p}: tip {tip:?}, Simo & Vu-Quoc {reference:?}");
        }
    }
}

// ==================== Nonlinear material ====================

/// A fiber cantilever bent in the x–z plane is the 2D fiber cantilever,
/// step for step.
#[test]
fn fiber_cantilever_in_3d_is_the_2d_one() {
    let (l, b, h, n) = (1.0, 0.1, 0.2, 10);
    let (e, fy) = (2e8, 250e3);
    let steel = FiberLaw1D::new(FiberMaterial::SteelBilinear { e, fy, hardening_ratio: 0.0 });
    // Four fibers across: one would leave no stiffness about the other axis.
    let s3 = FiberSection3D::rectangle(b, h, 4, 40, &steel);
    // GJ of the rectangle; it plays no part in bending in the x–z plane.
    let basic3 = move |le: f64| Box::new(FiberBasic3D::new(le, 8e7 * 2.3e-5, &s3, 5)) as Box<dyn BasicResponse3D>;
    // Reference y: local y is global y, so the depth h (local z) is along the load.
    let (mut m3, nodes) = polyline(&straight(n, l), Y, Kinematics::Linear, &basic3);
    let end3 = nodes[n];
    m3.add_load(end3, [0.0, 0.0, 1.0, 0.0, 0.0, 0.0]);
    let dof3 = m3.dof(end3, 2);

    let s2 = FiberSection2D::rectangle(b, h, 40, &steel);
    let mut m2 = Model2D::new();
    let n2: Vec<usize> = (0..=n).map(|k| m2.add_node(l * k as f64 / n as f64, 0.0)).collect();
    m2.fix(n2[0], [true; 3]);
    for w in n2.windows(2) {
        let fr = Frame2D::new(m2.frame_dofs(w[0], w[1]), m2.coords(w[0]), m2.coords(w[1]), Kinematics::Linear, Box::new(FiberBasic2D::new(l / n as f64, &s2, 5)))
            .unwrap();
        m2.add_element(Box::new(fr));
    }
    m2.add_load(n2[n], [0.0, 1.0, 0.0]);
    let dof2 = m2.dof(n2[n], 1);

    let target = 0.05;
    let o3 = solve(&mut m3, &Strategy::DisplacementControl { dof: dof3, target, increments: 20 }, &NewtonOptions::default()).unwrap();
    let o2 = solve(&mut m2, &Strategy::DisplacementControl { dof: dof2, target, increments: 20 }, &NewtonOptions::default()).unwrap();
    assert!(o3.completed() && o2.completed(), "3D: {:?} at λ = {} after {} steps; 2D: {:?}", o3.termination, o3.lambda, o3.steps.len(), o2.termination);
    for (a, b) in o3.steps.iter().zip(&o2.steps) {
        assert!((a.lambda - b.lambda).abs() < 1e-8 * b.lambda.abs().max(1.0), "λ: 3D {} vs 2D {}", a.lambda, b.lambda);
    }
}

// ==================== Tangents ====================

/// The co-rotational 3D tangent is the derivative of the internal force
/// with respect to translations and spatial rotation increments, elastic
/// and with yielded fibers, at a large rotation.
#[test]
fn frame3d_tangent_matches_finite_differences() {
    let steel = FiberLaw1D::new(FiberMaterial::SteelBilinear { e: 2e8, fy: 250e3, hardening_ratio: 0.02 });
    let section = FiberSection3D::rectangle(0.1, 0.2, 7, 9, &steel);
    let (xi, xj) = ([0.0, 0.0, 0.0], [0.6, 0.0, 0.8]);
    let base = |k: usize| NodeState3D { x0: if k == 0 { xi } else { xj }, u: [0.0; 3], r: rotation::IDENTITY };
    // A rigid rotation of the element plus deformation: yields part of the section.
    let rigid = exp([0.3, -0.9, 0.5]);
    let mut states = [base(0), base(1)];
    let dj = [xj[0] - xi[0], xj[1] - xi[1], xj[2] - xi[2]];
    let moved = rotation::mat_vec(&rigid, [dj[0] * 1.0004, dj[1] * 1.0004, dj[2] * 1.0004]);
    states[1].u = [moved[0] - dj[0], moved[1] - dj[1], moved[2] - dj[2]];
    states[0].r = mat_mul(&exp([0.004, 0.009, -0.006]), &rigid);
    states[1].r = mat_mul(&exp([-0.003, -0.011, 0.008]), &rigid);

    for plastic in [false, true] {
        let make = || -> Frame3D {
            let basic: Box<dyn BasicResponse3D> =
                if plastic { Box::new(FiberBasic3D::new(1.0, 1e4, &section, 5)) } else { Box::new(ElasticBasic3D::new(2e6, 3e2, 1e3, 2e3, 1.0)) };
            Frame3D::new([0, 1], xi, xj, Y, Kinematics::Corotational, basic).unwrap()
        };
        let mut e = make();
        e.update(&states).unwrap();
        let k = e.tangent().to_vec();
        let scale = k.iter().fold(0.0f64, |a, x| a.max(x.abs()));
        for col in 0..12 {
            let (node, local) = (col / 6, col % 6);
            let h = 1e-7;
            let mut f = [[0.0; 12]; 2];
            for (c, sign) in [(0, 1.0), (1, -1.0)] {
                let mut st = states;
                if local < 3 {
                    st[node].u[local] += sign * h;
                } else {
                    let mut d = [0.0; 3];
                    d[local - 3] = sign * h;
                    st[node].r = mat_mul(&exp(d), &st[node].r);
                }
                let mut ep = make();
                ep.update(&st).unwrap();
                f[c].copy_from_slice(ep.internal_force());
            }
            for row in 0..12 {
                let fd = (f[0][row] - f[1][row]) / (2.0 * h);
                assert!((fd - k[12 * row + col]).abs() < 1e-5 * scale, "plastic {plastic}: K[{row}][{col}] = {}, FD {fd}", k[12 * row + col]);
            }
        }
    }
}

// ==================== Size ====================

/// A space frame of 5×5 bays, 6 storeys (1,296 free DOFs), under lateral and
/// gravity load with large-displacement kinematics: the sparse solve keeps it
/// fast, and with a small load it matches the linear solution.
#[test]
fn space_frame_building_solves_sparse() {
    let (bays, storeys, span, height) = (5usize, 6usize, 6.0, 3.5);
    let (e, g, a, i, j) = (2e8, 8e7, 0.02, 2e-4, 3e-4);
    let build = |kin: Kinematics| -> (Model3D, Vec<usize>) {
        let mut m = Model3D::new();
        let mut id = vec![vec![vec![0usize; bays + 1]; bays + 1]; storeys + 1];
        for (s, plane) in id.iter_mut().enumerate() {
            for (x, row) in plane.iter_mut().enumerate() {
                for (y, node) in row.iter_mut().enumerate() {
                    *node = m.add_node([span * x as f64, span * y as f64, height * s as f64]);
                    if s == 0 {
                        m.fix(*node, [true; 6]);
                    }
                }
            }
        }
        let mut add = |m: &mut Model3D, p: usize, q: usize, reference: [f64; 3]| {
            let (xi, xj) = (m.coords(p), m.coords(q));
            let l = ((xj[0] - xi[0]).powi(2) + (xj[1] - xi[1]).powi(2) + (xj[2] - xi[2]).powi(2)).sqrt();
            let basic = Box::new(ElasticBasic3D::new(e * a, g * j, e * i, e * i, l));
            m.add_element(Box::new(Frame3D::new([p, q], xi, xj, reference, kin, basic).unwrap()));
        };
        for s in 1..=storeys {
            for x in 0..=bays {
                for y in 0..=bays {
                    add(&mut m, id[s - 1][x][y], id[s][x][y], [1.0, 0.0, 0.0]);
                    if x < bays {
                        add(&mut m, id[s][x][y], id[s][x + 1][y], Z);
                    }
                    if y < bays {
                        add(&mut m, id[s][x][y], id[s][x][y + 1], Z);
                    }
                }
            }
        }
        let top: Vec<usize> = id[storeys].iter().flatten().copied().collect();
        for x in 0..=bays {
            for y in 0..=bays {
                for s in 1..=storeys {
                    m.add_load(id[s][x][y], [2.0, 1.0, -20.0, 0.0, 0.0, 0.0]);
                }
            }
        }
        (m, top)
    };
    let (mut lin, top) = build(Kinematics::Linear);
    let (mut cr, _) = build(Kinematics::Corotational);
    let start = std::time::Instant::now();
    let ol = solve(&mut lin, &Strategy::LoadControl { target: 0.01, increments: 1 }, &NewtonOptions::default()).unwrap();
    let oc = solve(&mut cr, &Strategy::LoadControl { target: 0.01, increments: 2 }, &NewtonOptions::default()).unwrap();
    assert!(ol.completed() && oc.completed());
    let corner = top[top.len() - 1];
    let (ul, uc) = (ol.u[lin.dof(corner, 0)], oc.u[cr.dof(corner, 0)]);
    assert!((ul - uc).abs() < 1e-3 * ul.abs(), "small load: linear {ul} vs co-rotational {uc}");
    assert_eq!(oc.steps.last().unwrap().negative_eigenvalues, Some(0), "stable");
    assert!(start.elapsed().as_secs_f64() < 60.0, "took {:?}", start.elapsed());
}


/// A square column buckles in either lateral direction at the same load:
/// the critical point reports two modes, both lateral and orthogonal to the
/// load (the 3D co-rotational tangent is factored by LU, its stability read
/// from the symmetric part).
#[test]
fn a_square_column_has_two_buckling_modes() {
    let (l, ei, n) = (1.0, 1.0, 12);
    let p_cr = PI * PI * ei / (4.0 * l * l);
    let pts: Vec<[f64; 3]> = (0..=n).map(|i| [0.0, 0.0, l * i as f64 / n as f64]).collect();
    let (mut m, nodes) = polyline(&pts, [1.0, 0.0, 0.0], Kinematics::Corotational, &elastic3d(1e5, 0.8, ei, ei));
    let top = nodes[n];
    m.add_load(top, [0.0, 0.0, -1.0, 0.0, 0.0, 0.0]);
    let opts = NewtonOptions { branch_switching: true, ..NewtonOptions::default() };
    let out = solve(&mut m, &Strategy::ArcLength { target: 1.05 * p_cr, increments: 10, max_steps: 60 }, &opts).unwrap();
    let c = out.critical_points.first().unwrap_or_else(|| panic!("no critical point: {:?}", out.termination));
    assert_eq!(c.kind, CriticalKind::Bifurcation, "{c:?}");
    assert_eq!(c.multiplicity, 2);
    assert!((c.lambda / p_cr - 1.0).abs() < 0.01, "λ_cr = {}", c.lambda);
    for mode in &c.modes {
        let (ux, uy, uz) = (mode[m.dof(top, 0)], mode[m.dof(top, 1)], mode[m.dof(top, 2)]);
        assert!(uz.abs() < 1e-6 * (ux.abs() + uy.abs()), "a lateral mode: ({ux}, {uy}, {uz})");
    }
    // The two span the plane: their tip displacements are independent.
    let (a, b) = (&c.modes[0], &c.modes[1]);
    let det = a[m.dof(top, 0)] * b[m.dof(top, 1)] - a[m.dof(top, 1)] * b[m.dof(top, 0)];
    assert!(det.abs() > 1e-3, "two independent lateral directions");
}
