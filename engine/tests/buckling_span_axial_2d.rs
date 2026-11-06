//! 2D buckling of members whose axial force varies along the span under axial span loads.
//!
//! References, all for a member of length L and stiffness EI with compression C(x) = λ·c(x):
//! the slope θ = v' solves θ'' + λ·c(x)/EI·θ = 0 between an end where θ = 0 and a shear-free end
//! where θ' = 0.
//! - c rising linearly from 0 at the θ = 0 end to P at the θ' = 0 end: λP = (1.5·j)²·EI/L² with
//!   j the first zero of J₋₂/₃, 3.476619 (RK4 shooting of the same equation agrees to 1e-12).
//! - c falling linearly from P to 0 (Euler's heavy column): λP = (1.5·j)²·EI/L² with j the first
//!   zero of J₋₁/₃, 7.837347.
//! - c = 0 up to L/2 and P beyond: θ = x below, then w·tan(w) = 1 with λP·L²/EI = 4w², 2.960696.
//!
//! Each is checked with one member against the one-member Ritz value with the consistent Kg
//! ∫N·φ'·φ' dx (cubic Hermite, 4-point Gauss, computed outside the engine: 1.9 %, 0.7 % and 3.2 %
//! above the exact value) and with a mesh fine enough to be within 1e-3 of it.
use crate::common::make_input;
use dedaliano_engine::solver::buckling::solve_buckling_2d;
use dedaliano_engine::types::*;

const E: f64 = 200_000.0;
const IZ: f64 = 1e-4;
const L: f64 = 4.0;
const P: f64 = 100.0;
const EI: f64 = E * 1000.0 * IZ;

const RISING: f64 = 3.476_619_007_992;
const FALLING: f64 = 7.837_347_438_943;
const STEP: f64 = 2.960_695_537_580;

const RISING_ONE: f64 = 3.542_486_889_354;
const FALLING_ONE: f64 = 7.888_974_490_720;
const STEP_ONE: f64 = 3.056_319_391_837;

fn nodal(node_id: usize, fx: f64) -> SolverLoad {
    SolverLoad::Nodal(SolverNodalLoad { node_id, fx, fz: 0.0, my: 0.0 })
}

fn axial(element_id: usize, q_i: f64, q_j: f64) -> SolverLoad {
    SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id, q_i, q_j, a: None, b: None })
}

fn point_axial(element_id: usize, a: f64, px: f64) -> SolverLoad {
    SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id, a, p: 0.0, px: Some(px), my: None })
}

/// A member along X from x = 0 to x = L in `n` elements, with the given supports at its ends.
fn column(n: usize, start: &str, end: &str, hinge_end: bool, loads: impl Fn(usize, f64) -> Vec<SolverLoad>, tip: f64) -> SolverInput {
    let h = L / n as f64;
    let nodes = (0..=n).map(|i| (i + 1, i as f64 * h, 0.0)).collect();
    let elems = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, hinge_end && i + 1 == n)).collect();
    let mut all: Vec<SolverLoad> = (0..n).flat_map(|i| loads(i + 1, i as f64 * h)).collect();
    all.push(nodal(n + 1, tip));
    make_input(nodes, vec![(1, E, 0.3)], vec![(1, 0.01, IZ)], elems, vec![(1, 1, start), (2, n + 1, end)], all)
}

fn critical(input: &SolverInput) -> f64 {
    solve_buckling_2d(input, 1).expect("buckling solves").modes[0].load_factor * P * L * L / EI
}

fn one_member(got: f64, ritz: f64, exact: f64) {
    assert!((got - ritz).abs() <= 1e-9 * ritz, "λP·L²/EI = {got}, one-member consistent model {ritz}");
    assert!(ritz > exact, "the one-member model is an upper bound");
}

fn within(got: f64, exact: f64, above: f64) {
    assert!(got >= exact * (1.0 - 1e-6) && got <= exact * (1.0 + above), "λP·L²/EI = {got}, exact {exact}, allowed up to +{above}");
}

/// Fixed at x = 0, free at x = L under a tip thrust P, with q = P/L along +x: N = 0 at the support
/// and −P at the tip. The mean −P/2 put the one-member factor at 4.97, 43 % above the exact 3.48.
fn rising(n: usize) -> SolverInput {
    column(n, "fixed", "free", false, |id, _| vec![axial(id, P / L, P / L)], -P)
}

#[test]
fn cantilever_with_compression_growing_to_the_free_end_one_member() {
    one_member(critical(&rising(1)), RISING_ONE, RISING);
}

#[test]
fn cantilever_with_compression_growing_to_the_free_end_mesh() {
    within(critical(&rising(8)), RISING, 1e-3);
}

/// Euler's heavy column: fixed at x = 0, free at x = L, q = −P/L along x and no tip load, so N
/// falls from −P at the support to 0 at the tip.
fn falling(n: usize) -> SolverInput {
    column(n, "fixed", "free", false, |id, _| vec![axial(id, -P / L, -P / L)], 0.0)
}

#[test]
fn heavy_cantilever_one_member() {
    one_member(critical(&falling(1)), FALLING_ONE, FALLING);
}

#[test]
fn heavy_cantilever_mesh() {
    within(critical(&falling(8)), FALLING, 1e-3);
}

/// The mirror of `rising`: rotation held and sway free at x = 0 (guidedZ), pinned at x = L on a
/// roller under the thrust P. Compression is largest at the pin, the end that rotates most, as in
/// a pinned-base sway column carrying its own weight.
fn pinned_sway(n: usize, hinge_end: bool) -> SolverInput {
    column(n, "guidedZ", "rollerX", hinge_end, |id, _| vec![axial(id, P / L, P / L)], -P)
}

#[test]
fn pinned_sway_column_with_compression_growing_to_the_pin() {
    one_member(critical(&pinned_sway(1, false)), RISING_ONE, RISING);
    within(critical(&pinned_sway(8, false)), RISING, 1e-3);
}

/// With the end rotation condensed, the one-member model has the sway v alone, θ = −1.5·v/L at the
/// hinge, stiffness 3EI/L³ and geometric work ∫(x/L)·φ'² dx = (33/40)·v²/L: λP·L²/EI = 40/11
/// (the mean −P/2 gave 5).
#[test]
fn pinned_sway_column_with_an_end_hinge_at_the_pin() {
    let one = critical(&pinned_sway(1, true));
    assert!((one - 40.0 / 11.0).abs() <= 1e-9, "λP·L²/EI = {one}, condensed one-member model 40/11");
    within(critical(&pinned_sway(8, true)), RISING, 1e-3);
}

/// Fixed at x = 0, free at x = L under a tip thrust P, with an axial point load +P at mid-span:
/// N = 0 below it and −P above it.
fn step(n: usize) -> SolverInput {
    column(n, "fixed", "free", false, |id, x0| {
        let h = L / n as f64;
        let mid = L / 2.0;
        if mid > x0 && mid < x0 + h { vec![point_axial(id, mid - x0, P)] } else { vec![] }
    }, -P)
}

#[test]
fn cantilever_with_an_axial_point_load_at_mid_span_one_member() {
    one_member(critical(&step(1)), STEP_ONE, STEP);
}

#[test]
fn cantilever_with_an_axial_point_load_at_mid_span_mesh() {
    within(critical(&step(15)), STEP, 1e-3);
}

/// A partial trapezoid: the fine mesh puts each element under its own share of the same load.
#[test]
fn a_partial_trapezoid_matches_the_mesh() {
    let (a, b, qa, qb) = (1.0, 3.0, 30.0, 70.0);
    let one = make_input(
        vec![(1, 0.0, 0.0), (2, L, 0.0)], vec![(1, E, 0.3)], vec![(1, 0.01, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)], vec![(1, 1, "fixed")],
        vec![SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id: 1, q_i: qa, q_j: qb, a: Some(a), b: Some(b) }), nodal(2, -P)],
    );
    let q = |x: f64| qa + (qb - qa) * (x - a) / (b - a);
    let n = 40;
    let mesh = column(n, "fixed", "free", false, |id, x0| {
        let x1 = x0 + L / n as f64;
        let (s, e) = (x0.max(a), x1.min(b));
        if e > s + 1e-12 {
            vec![SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id: id, q_i: q(s), q_j: q(e), a: Some(s - x0), b: Some(e - x0) })]
        } else {
            vec![]
        }
    }, -P);
    let (one, mesh) = (critical(&one), critical(&mesh));
    assert!(one >= mesh * (1.0 - 1e-6) && one <= mesh * 1.03, "one member {one}, mesh {mesh}");
}

#[test]
fn an_inclined_member_buckles_as_the_horizontal_one() {
    let (c, s) = (30f64.to_radians().cos(), 30f64.to_radians().sin());
    let input = make_input(
        vec![(1, 0.0, 0.0), (2, L * c, L * s)], vec![(1, E, 0.3)], vec![(1, 0.01, IZ)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)], vec![(1, 1, "fixed")],
        vec![axial(1, P / L, P / L), SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: -P * c, fz: -P * s, my: 0.0 })],
    );
    one_member(critical(&input), RISING_ONE, RISING);
}

#[test]
fn the_certified_solve_gives_the_same_corrected_factor() {
    let input = rising(1);
    let plain = solve_buckling_2d(&input, 1).unwrap().modes[0].load_factor;
    let certified = dedaliano_engine::certify::buckling::certify_buckling_2d(&input, 1).expect("the certified solve accepts the model");
    assert_eq!(certified.results.modes[0].load_factor, plain);
    one_member(plain * P * L * L / EI, RISING_ONE, RISING);
}
