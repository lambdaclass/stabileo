//! Linear buckling of the nonlinear framework's models (src/nonlinear/buckling.rs),
//! against the engine's linear buckling solver and closed forms; and its
//! modes as GMNIA imperfections.
use crate::common;

use common::*;
use dedaliano_engine::element::fiber_beam::FiberMaterial;
use dedaliano_engine::nonlinear::*;
use dedaliano_engine::solver::buckling::solve_buckling_2d;
use dedaliano_engine::types::*;
use std::f64::consts::PI;

const E_MPA: f64 = 200_000.0;

/// A column of `n` frames from (x, 0) to (x, h): the node ids along it.
fn column(m: &mut Model2D, x: f64, h: f64, n: usize, ea: f64, ei: f64) -> Vec<usize> {
    let nodes: Vec<usize> = (0..=n).map(|i| m.add_node(x, h * i as f64 / n as f64)).collect();
    add_frames(m, &nodes, ea, ei);
    nodes
}

fn add_frames(m: &mut Model2D, nodes: &[usize], ea: f64, ei: f64) {
    for w in nodes.windows(2) {
        let (xi, xj) = (m.coords(w[0]), m.coords(w[1]));
        let l = ((xj[0] - xi[0]).powi(2) + (xj[1] - xi[1]).powi(2)).sqrt();
        let e = Frame2D::new(m.frame_dofs(w[0], w[1]), xi, xj, Kinematics::Corotational, Box::new(ElasticBasic2D::new(ea, ei, l))).unwrap();
        m.add_element(Box::new(e));
    }
}

/// A pinned column of height `h` under a unit load down at its top.
fn pinned_column(h: f64, n: usize, ea: f64, ei: f64) -> (Model2D, Vec<usize>) {
    let mut m = Model2D::new();
    let nodes = column(&mut m, 0.0, h, n, ea, ei);
    m.fix(nodes[0], [true, true, false]);
    m.fix(nodes[n], [true, false, false]);
    m.add_load(nodes[n], [0.0, -1.0, 0.0]);
    (m, nodes)
}

/// The engine's linear buckling of the same mesh: frames numbered along
/// `lines` (chains of node indices, 0-based) with coordinates `xy`.
fn oracle(xy: &[[f64; 2]], lines: &[Vec<usize>], a: f64, iz: f64, sups: Vec<(usize, usize, &str)>, loads: Vec<(usize, f64)>) -> f64 {
    let nodes = xy.iter().enumerate().map(|(i, p)| (i + 1, p[0], p[1])).collect();
    let mut elems = Vec::new();
    for line in lines {
        for w in line.windows(2) {
            elems.push((elems.len() + 1, "frame", w[0] + 1, w[1] + 1, 1, 1, false, false));
        }
    }
    let loads = loads.into_iter().map(|(n, fz)| SolverLoad::Nodal(SolverNodalLoad { node_id: n + 1, fx: 0.0, fz, my: 0.0 })).collect();
    let input = make_input(nodes, vec![(1, E_MPA, 0.3)], vec![(1, a, iz)], elems, sups, loads);
    solve_buckling_2d(&input, 1).unwrap().modes[0].load_factor
}

fn frames_3d(m: &mut Model3D, nodes: &[usize], reference: [f64; 3], basic: &dyn Fn(f64) -> Box<dyn BasicResponse3D>) {
    for w in nodes.windows(2) {
        let (xi, xj) = (m.coords(w[0]), m.coords(w[1]));
        let l = ((xj[0] - xi[0]).powi(2) + (xj[1] - xi[1]).powi(2) + (xj[2] - xi[2]).powi(2)).sqrt();
        m.add_element(Box::new(Frame3D::new([w[0], w[1]], xi, xj, reference, Kinematics::Corotational, basic(l)).unwrap()));
    }
}

/// A pinned column whose nodes are moved by `offsets` (one per node), with
/// basic responses from `basic`.
fn imperfect_column(h: f64, n: usize, offsets: &[[f64; 2]], basic: &dyn Fn(f64) -> Box<dyn BasicResponse2D>) -> (Model2D, Vec<usize>) {
    let mut m = Model2D::new();
    let nodes: Vec<usize> = (0..=n).map(|i| m.add_node(offsets[i][0], h * i as f64 / n as f64 + offsets[i][1])).collect();
    for w in nodes.windows(2) {
        let (xi, xj) = (m.coords(w[0]), m.coords(w[1]));
        let l = ((xj[0] - xi[0]).powi(2) + (xj[1] - xi[1]).powi(2)).sqrt();
        let e = Frame2D::new(m.frame_dofs(w[0], w[1]), xi, xj, Kinematics::Corotational, basic(l)).unwrap();
        m.add_element(Box::new(e));
    }
    m.fix(nodes[0], [true, true, false]);
    m.fix(nodes[n], [true, false, false]);
    m.add_load(nodes[n], [0.0, -1.0, 0.0]);
    (m, nodes)
}


const A: f64 = 0.01;
const IZ: f64 = 2e-5;

fn ea_ei() -> (f64, f64) {
    (E_MPA * 1000.0 * A, E_MPA * 1000.0 * IZ)
}

fn modes(k: usize) -> BucklingOptions {
    BucklingOptions { modes: k, ..Default::default() }
}

/// A pinned column: the first factor is the engine's linear buckling
/// solver's and Euler's to the element's discretization (its initial-stress
/// stiffness is the string's, N/L, not the cubic one), the higher ones are
/// near 4 and 9 times it, and the driver's nonlinear analysis of the perfect
/// column bifurcates where the LBA says.
#[test]
fn a_pinned_column_buckles_at_euler_load() {
    let (h, n) = (4.0, 16);
    let (ea, ei) = ea_ei();
    let (mut m, nodes) = pinned_column(h, n, ea, ei);
    let b = linear_buckling(&mut m, &modes(3)).unwrap();
    let euler = PI * PI * ei / (h * h);
    let xy: Vec<[f64; 2]> = nodes.iter().map(|&i| m.coords(i)).collect();
    let engine = oracle(&xy, &[(0..=n).collect()], A, IZ, vec![(1, 1, "pinned"), (2, n + 1, "rollerZ")], vec![(n, -1.0)]);
    assert!((b.factors[0] / engine - 1.0).abs() < 5e-3, "LBA {} vs the engine's {engine}", b.factors[0]);
    assert!((b.factors[0] / euler - 1.0).abs() < 5e-3);
    assert!((b.factors[1] / (4.0 * euler) - 1.0).abs() < 0.02, "{:?}", b.factors);
    assert!((b.factors[2] / (9.0 * euler) - 1.0).abs() < 0.04, "{:?}", b.factors);
    // The first mode is a half sine: largest at mid-height, scaled to 1 there.
    let t = m.translations(&b.modes[0]);
    assert!((t[nodes[n / 2]][0] - 1.0).abs() < 1e-12);
    for (i, &node) in nodes.iter().enumerate() {
        let sine = (PI * i as f64 / n as f64).sin();
        assert!((t[node][0] - sine).abs() < 1e-3, "node {i}: {} vs {sine}", t[node][0]);
    }

    let out = solve(&mut pinned_column(h, n, ea, ei).0, &Strategy::Auto { target: 1.1 * euler, increments: 10, max_steps: 200 }, &NewtonOptions::default()).unwrap();
    let c = &out.critical_points[0];
    assert!((c.lambda / b.factors[0] - 1.0).abs() < 3e-3, "bifurcation at {}, LBA {}", c.lambda, b.factors[0]);
}

/// A portal frame sways at the engine's linear buckling load.
#[test]
fn a_portal_frame_sways_at_the_engine_buckling_load() {
    let (h, n) = (4.0, 16);
    let (ea, ei) = ea_ei();
    let mut m = Model2D::new();
    let left = column(&mut m, 0.0, h, n, ea, ei);
    let right = column(&mut m, 6.0, h, n, ea, ei);
    let mut beam = vec![left[n]];
    beam.extend((1..n).map(|i| m.add_node(6.0 * i as f64 / n as f64, h)));
    beam.push(right[n]);
    add_frames(&mut m, &beam, ea, ei);
    m.fix(left[0], [true; 3]);
    m.fix(right[0], [true; 3]);
    m.add_load(left[n], [0.0, -1.0, 0.0]);
    m.add_load(right[n], [0.0, -1.0, 0.0]);
    let b = linear_buckling(&mut m, &modes(1)).unwrap();
    let xy: Vec<[f64; 2]> = (0..m.n_dofs() / 3).map(|i| m.coords(i)).collect();
    let engine = oracle(&xy, &[left.clone(), right.clone(), beam], A, IZ, vec![(1, left[0] + 1, "fixed"), (2, right[0] + 1, "fixed")], vec![(left[n], -1.0), (right[n], -1.0)]);
    assert!((b.factors[0] / engine - 1.0).abs() < 3e-3, "LBA {} vs the engine's {engine}", b.factors[0]);
    // Sway: both column tops move the same way, by the same amount.
    let t = m.translations(&b.modes[0]);
    assert!((t[left[n]][0] - t[right[n]][0]).abs() < 1e-6 && t[left[n]][0].abs() > 0.5, "{:?} {:?}", t[left[n]], t[right[n]]);
}

/// Nothing buckles without compression: a column in tension, a cantilever
/// under a transverse load.
#[test]
fn without_compression_nothing_buckles() {
    let (ea, ei) = ea_ei();
    let (mut m, nodes) = pinned_column(4.0, 16, ea, ei);
    m.add_load(nodes[16], [0.0, 2.0, 0.0]);
    assert!(linear_buckling(&mut m, &modes(2)).unwrap().factors.is_empty());
    let mut m = Model2D::new();
    let nodes = column(&mut m, 0.0, 4.0, 16, ea, ei);
    m.fix(nodes[0], [true; 3]);
    m.add_load(nodes[16], [1.0, 0.0, 0.0]);
    assert!(linear_buckling(&mut m, &modes(2)).unwrap().factors.is_empty());
}

/// A mechanism has no LBA: its unloaded stiffness is singular.
#[test]
fn a_mechanism_is_refused() {
    // A column pinned at its foot and free at its top: it falls over.
    let (ea, ei) = ea_ei();
    let mut m = Model2D::new();
    let nodes = column(&mut m, 0.0, 4.0, 4, ea, ei);
    m.fix(nodes[0], [true, true, false]);
    m.add_load(nodes[4], [0.0, -1.0, 0.0]);
    let err = linear_buckling(&mut m, &modes(1)).unwrap_err();
    assert!(err.contains("not stable") || err.contains("singular"), "{err}");
}

/// A square cantilever column in 3D: a double factor, π²EI/4L², with one mode
/// in each lateral direction.
#[test]
fn a_square_column_buckles_in_two_planes_at_once() {
    let (ea, gj, ei, h, n) = (2e6, 8e2, 1e3, 3.0, 16);
    let mut m = Model3D::new();
    let nodes: Vec<usize> = (0..=n).map(|i| m.add_node([0.0, 0.0, h * i as f64 / n as f64])).collect();
    frames_3d(&mut m, &nodes, [1.0, 0.0, 0.0], &|l| Box::new(ElasticBasic3D::new(ea, gj, ei, ei, l)));
    m.fix(nodes[0], [true; 6]);
    m.add_load(nodes[n], [0.0, 0.0, -1.0, 0.0, 0.0, 0.0]);
    let b = linear_buckling(&mut m, &modes(2)).unwrap();
    let euler = PI * PI * ei / (4.0 * h * h);
    assert!((b.factors[1] / b.factors[0] - 1.0).abs() < 1e-9, "{:?}", b.factors);
    assert!((b.factors[0] / euler - 1.0).abs() < 2e-3, "{:?} vs {euler}", b.factors);
    let tops: Vec<[f64; 3]> = b.modes.iter().map(|v| m.translations(v)[nodes[n]]).collect();
    let dot = tops[0][0] * tops[1][0] + tops[0][1] * tops[1][1];
    assert!(dot.abs() < 1e-6, "the two modes are orthogonal: {tops:?}");
}

/// Lateral-torsional buckling of a fork-supported beam under uniform moment:
/// M_cr = (π/L)·√(EI_z·GJ), and its second mode (two half waves) at twice
/// it. The moments' share of the 3D initial-stress stiffness.
#[test]
fn a_beam_under_uniform_moment_buckles_laterally() {
    let (l, n) = (6.0, 24);
    let (eiy, eiz, gj) = (2e4, 5e2, 3e2);
    let mut m = Model3D::new();
    let nodes: Vec<usize> = (0..=n).map(|i| m.add_node([l * i as f64 / n as f64, 0.0, 0.0])).collect();
    // Local y along global y: EI_y about it is the strong axis.
    frames_3d(&mut m, &nodes, [0.0, 1.0, 0.0], &|le| Box::new(ElasticBasic3D::new(1e7, gj, eiy, eiz, le)));
    m.fix(nodes[0], [true, true, true, true, false, false]);
    m.fix(nodes[n], [false, true, true, true, false, false]);
    m.add_load(nodes[0], [0.0, 0.0, 0.0, 0.0, 1.0, 0.0]);
    m.add_load(nodes[n], [0.0, 0.0, 0.0, 0.0, -1.0, 0.0]);
    let b = linear_buckling(&mut m, &modes(2)).unwrap();
    let mcr = PI / l * (eiz * gj).sqrt();
    assert!((b.factors[0] / mcr - 1.0).abs() < 5e-3, "{:?} vs M_cr {mcr}", b.factors);
    assert!((b.factors[1] / (2.0 * mcr) - 1.0).abs() < 0.01, "{:?}", b.factors);
    // Out of plane: the mode moves the beam sideways, not down.
    let t = m.translations(&b.modes[0]);
    assert!(t.iter().all(|v| v[2].abs() < 1e-6 * t[nodes[n / 2]][1].abs().max(1e-300)), "{:?}", t[nodes[n / 2]]);
}

/// An elastic column with the first mode as imperfection, of amplitude e₀ at
/// mid-height, deflects by e₀·α/(1 − α) more under α times its critical
/// load: the amplification of a sinusoidal imperfection.
#[test]
fn an_imperfect_elastic_column_is_amplified_by_one_over_one_minus_alpha() {
    let (h, n) = (4.0, 16);
    let (ea, ei) = ea_ei();
    let elastic = move |l: f64| Box::new(ElasticBasic2D::new(ea, ei, l)) as Box<dyn BasicResponse2D>;
    let (mut perfect, nodes) = imperfect_column(h, n, &vec![[0.0; 2]; n + 1], &elastic);
    let b = linear_buckling(&mut perfect, &BucklingOptions::default()).unwrap();
    let e0 = h / 1000.0;
    let offsets: Vec<[f64; 2]> = perfect.translations(&b.modes[0]).iter().map(|t| [e0 * t[0], e0 * t[1]]).collect();
    let mid = nodes[n / 2];
    assert_eq!(offsets[mid][0], e0);
    for alpha in [0.25, 0.5, 0.8] {
        let (mut m, _) = imperfect_column(h, n, &offsets, &elastic);
        let out = solve(&mut m, &Strategy::LoadControl { target: alpha * b.factors[0], increments: 10 }, &NewtonOptions::default()).unwrap();
        assert!(out.completed());
        let w = out.u[m.dof(mid, 0)];
        let expected = e0 * alpha / (1.0 - alpha);
        assert!((w / expected - 1.0).abs() < 0.01, "α = {alpha}: {w} vs {expected}");
    }
}

/// GMNIA of a square solid steel column (λ̄ = 1, perfectly plastic, no
/// residual stresses) with the imperfection of EN 1993-1-1 5.3.2(11): the
/// first mode, e₀ = α(λ̄ − 0.2)·W_pl/A (curve c, γ_M1 = 1). The peak load lies
/// between the elastic first-yield load (Perry) and the load at which the
/// elastic second-order moment reaches the rectangle's plastic interaction
/// M/M_p = 1 − (N/N_p)²: plasticity spreads before the peak. It converges
/// with the mesh, and is within 5 % of the Eurocode's χ, which the same e₀
/// gives with an elastic analysis and a linear interaction.
#[test]
fn gmnia_of_a_steel_column_with_the_eurocode_imperfection() {
    let (e, fy, side): (f64, f64, f64) = (2.1e8, 355e3, 0.1);
    let area = side * side;
    let n_pl = area * fy;
    let lbar = 1.0;
    let l = PI * (e * side.powi(4) / 12.0 / n_pl).sqrt() / lbar;
    let alpha = 0.49;
    let phi = 0.5 * (1.0 + alpha * (lbar - 0.2) + lbar * lbar);
    let chi = 1.0 / (phi + (phi * phi - lbar * lbar).sqrt());
    let e0 = alpha * (lbar - 0.2) * (side.powi(3) / 4.0) / area;
    let steel = FiberLaw1D::new(FiberMaterial::SteelBilinear { e, fy, hardening_ratio: 0.0 });
    let section = FiberSection2D::rectangle(side, side, 40, &steel);

    let mut peaks = Vec::new();
    let mut ncr = 0.0;
    for n in [8usize, 16] {
        let fiber = |le: f64| Box::new(FiberBasic2D::new(le, &section, 5)) as Box<dyn BasicResponse2D>;
        let (mut perfect, _) = imperfect_column(l, n, &vec![[0.0; 2]; n + 1], &fiber);
        let b = linear_buckling(&mut perfect, &BucklingOptions::default()).unwrap();
        ncr = b.factors[0];
        let offsets: Vec<[f64; 2]> = perfect.translations(&b.modes[0]).iter().map(|t| [e0 * t[0], e0 * t[1]]).collect();
        let (mut m, _) = imperfect_column(l, n, &offsets, &fiber);
        let out = solve(&mut m, &Strategy::ArcLength { target: n_pl, increments: 20, max_steps: 60 }, &NewtonOptions::default()).unwrap();
        let peak = out.steps.iter().map(|s| s.lambda).fold(0.0f64, f64::max);
        assert!(out.lambda < 0.95 * peak, "the analysis went past the peak: last λ {} vs peak {peak}", out.lambda);
        peaks.push(peak / n_pl);
    }
    // The bracket, with N_cr the mesh's.
    let r = ncr / n_pl;
    let k_el = e0 * area / (side.powi(3) / 6.0);
    let k_pl = e0 * area / (side.powi(3) / 4.0);
    let root = |g: &dyn Fn(f64) -> f64| {
        let (mut lo, mut hi) = (1e-9, r.min(1.0) - 1e-9);
        for _ in 0..200 {
            let mid = 0.5 * (lo + hi);
            if g(mid) < 0.0 { lo = mid } else { hi = mid }
        }
        lo
    };
    let first_yield = root(&|x| x + k_el * x / (1.0 - x / r) - 1.0);
    let plastic = root(&|x| k_pl * x / (1.0 - x / r) - (1.0 - x * x));
    let p = peaks[1];
    assert!(first_yield < p && p < plastic, "GMNIA {p:.4} outside [{first_yield:.4}, {plastic:.4}]");
    assert!((peaks[0] - peaks[1]).abs() < 0.01, "mesh: {peaks:?}");
    assert!((p / chi - 1.0).abs() < 0.05, "GMNIA {p:.4} vs χ {chi:.4}");
}
