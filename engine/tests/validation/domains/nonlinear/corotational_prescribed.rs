/// Validation: co-rotational analysis with prescribed support motion and
/// analyses continued from a converged state.
///
///   1. A flat elastica bent by end rotations into the exact circular arc
///      (radius L/2α, constant moment EI·2α/L, no axial force).
///   2. A small support settlement matches the linear solution 3EIδ/L³.
///   3. Loads applied in two continued stages reach the one-stage state.
///   4. Continuing a converged state without changes leaves it unchanged.
///   5. A start state from another model is refused.
///   6. A support fixed where the start state left its node holds it there.
use crate::common::*;
use dedaliano_engine::solver::corotational::{solve_corotational_2d, solve_corotational_2d_from, CorotationalStart2D};
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;

const E: f64 = 200_000.0;
const IZ: f64 = 1e-6;
const EI: f64 = E * 1000.0 * IZ;

fn strip(n: usize, length: f64, area: f64) -> SolverInput {
    let nodes = (0..=n).map(|i| (i, length * i as f64 / n as f64, 0.0)).collect();
    let elems = (0..n).map(|i| (i, "frame", i, i + 1, 1, 1, false, false)).collect();
    make_input(nodes, vec![(1, E, 0.3)], vec![(1, area, IZ)], elems, vec![(1, 0, "fixed"), (2, n, "fixed")], vec![])
}

fn clamp(input: &SolverInput, theta: f64, chord: f64, length: f64) -> SolverInput {
    let mut m = input.clone();
    let a = m.supports.get_mut("1").unwrap();
    a.dry = Some(theta);
    let b = m.supports.get_mut("2").unwrap();
    b.dry = Some(-theta);
    b.dx = Some(chord - length);
    m
}

/// Largest departures from the exact arc: radial offset over R, nodal turn,
/// moment over EI·2α/L and axial force over (EI·2α/L)/L.
fn arc_errors(n: usize) -> [f64; 4] {
    let (length, alpha) = (2.0, 0.6);
    let flat = strip(n, length, 1e-3);
    let mut model = flat.clone();
    let mut state: Vec<Displacement> = vec![];
    let mut forces = vec![];
    for k in 1..=12 {
        let theta = alpha * k as f64 / 12.0;
        let next = clamp(&flat, theta, length * theta.sin() / theta, length);
        let start = (k > 1).then(|| CorotationalStart2D { input: &model, displacements: &state });
        let r = solve_corotational_2d_from(&next, start.as_ref(), 50, 1e-9, 2, false).unwrap();
        assert!(r.converged, "stage {k} did not converge");
        state = r.results.displacements;
        forces = r.results.element_forces;
        model = next;
    }
    let radius = length / (2.0 * alpha);
    let chord = length * alpha.sin() / alpha;
    let (cx, cz) = (chord / 2.0, -radius * alpha.cos());
    let moment = EI * 2.0 * alpha / length;
    let mut e = [0.0f64; 4];
    for d in &state {
        let x = length * d.node_id as f64 / n as f64 + d.ux;
        e[0] = e[0].max(((((x - cx).powi(2) + (d.uz - cz).powi(2)).sqrt() - radius) / radius).abs());
        e[1] = e[1].max((d.ry - (alpha - 2.0 * alpha * d.node_id as f64 / n as f64)).abs());
    }
    for ef in &forces {
        e[2] = e[2].max((ef.m_start.abs() - moment).abs().max((ef.m_end.abs() - moment).abs()) / moment);
        e[3] = e[3].max(ef.n_start.abs() / (moment / length));
    }
    e
}

#[test]
fn validation_corotational_elastica_bent_into_a_circular_arc() {
    let coarse = arc_errors(20);
    let fine = arc_errors(40);
    for (k, limit) in [1e-4, 5e-4, 3e-3, 3e-2].into_iter().enumerate() {
        assert!(fine[k] < limit, "error {k} is {:.3e} with 40 members", fine[k]);
        assert!(coarse[k] / fine[k] > 3.5, "error {k} falls from {:.3e} to {:.3e} when h halves, not as h²", coarse[k], fine[k]);
    }
}

#[test]
fn validation_corotational_small_settlement_matches_linear() {
    let length = 4.0;
    let delta = -1e-4;
    let mut input = make_input(
        (0..=8).map(|i| (i, length * i as f64 / 8.0, 0.0)).collect(),
        vec![(1, E, 0.3)],
        vec![(1, 1e-2, IZ)],
        (0..8).map(|i| (i, "frame", i, i + 1, 1, 1, false, false)).collect(),
        vec![(1, 0, "fixed"), (2, 8, "rollerX")],
        vec![],
    );
    input.supports.get_mut("2").unwrap().dz = Some(delta);
    let lin = linear::solve_2d(&input).unwrap();
    let cr = solve_corotational_2d(&input, 50, 1e-10, 4, false).unwrap();
    assert!(cr.converged);
    let exact = 3.0 * EI * delta.abs() / length.powi(3);
    let reaction = |rs: &[Reaction]| rs.iter().find(|r| r.node_id == 8).unwrap().rz;
    assert!((reaction(&lin.reactions).abs() - exact).abs() < 1e-6 * exact);
    assert!((reaction(&cr.results.reactions) - reaction(&lin.reactions)).abs() < 1e-4 * exact);
    let tip = cr.results.displacements.iter().find(|d| d.node_id == 8).unwrap();
    assert!((tip.uz - delta).abs() < 1e-15);
}

#[test]
fn validation_corotational_continued_loading_reaches_the_one_stage_state() {
    let tip = |p: f64| {
        make_input(
            (0..=10).map(|i| (i, 0.3 * i as f64, 0.0)).collect(),
            vec![(1, E, 0.3)],
            vec![(1, 1e-3, IZ)],
            (0..10).map(|i| (i, "frame", i, i + 1, 1, 1, false, false)).collect(),
            vec![(1, 0, "fixed")],
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 10, fx: 0.0, fz: -p, my: 0.0 })],
        )
    };
    let p = 2.0 * EI / 9.0;
    let once = solve_corotational_2d(&tip(p), 60, 1e-10, 10, false).unwrap();
    let half = solve_corotational_2d(&tip(p / 2.0), 60, 1e-10, 5, false).unwrap();
    let first = tip(p / 2.0);
    let start = CorotationalStart2D { input: &first, displacements: &half.results.displacements };
    let twice = solve_corotational_2d_from(&tip(p), Some(&start), 60, 1e-10, 5, false).unwrap();
    assert!(once.converged && twice.converged);
    let at = |r: &AnalysisResults| r.displacements.iter().find(|d| d.node_id == 10).unwrap().clone();
    let (a, b) = (at(&once.results), at(&twice.results));
    assert!(a.uz < -0.5, "the tip should deflect by a large fraction of the span, got {}", a.uz);
    assert!((a.ux - b.ux).abs() < 1e-8 && (a.uz - b.uz).abs() < 1e-8 && (a.ry - b.ry).abs() < 1e-8);
    let base = |r: &AnalysisResults| r.reactions.iter().find(|r| r.node_id == 0).unwrap().clone();
    assert!((base(&once.results).my - base(&twice.results).my).abs() < 1e-6 * base(&once.results).my.abs());
    assert!((base(&twice.results).rz - p).abs() < 1e-8 * p);
}

#[test]
fn validation_corotational_continuing_an_unchanged_model_keeps_its_state() {
    let flat = strip(16, 1.0, 1e-3);
    let bent = clamp(&flat, 0.3, 0.3f64.sin() / 0.3, 1.0);
    let r = solve_corotational_2d(&bent, 50, 1e-10, 6, false).unwrap();
    let start = CorotationalStart2D { input: &bent, displacements: &r.results.displacements };
    let again = solve_corotational_2d_from(&bent, Some(&start), 50, 1e-10, 3, false).unwrap();
    assert!(again.converged);
    for (a, b) in r.results.displacements.iter().zip(&again.results.displacements) {
        assert!((a.ux - b.ux).abs() < 1e-12 && (a.uz - b.uz).abs() < 1e-12 && (a.ry - b.ry).abs() < 1e-12);
    }
}

#[test]
fn validation_corotational_start_from_another_model_is_refused() {
    let flat = strip(16, 1.0, 1e-3);
    let r = solve_corotational_2d(&clamp(&flat, 0.1, 0.1f64.sin() / 0.1, 1.0), 50, 1e-10, 2, false).unwrap();
    let other = strip(8, 1.0, 1e-3);
    let start = CorotationalStart2D { input: &other, displacements: &r.results.displacements };
    let e = solve_corotational_2d_from(&flat, Some(&start), 50, 1e-10, 2, false).unwrap_err();
    assert!(e.contains("other nodes"), "{e}");
}

/// End rotations ±α on a strip whose far end slides freely give the circular
/// arc of chord L·sin α/α; fixing that end where it stands changes nothing.
#[test]
fn validation_corotational_support_fixed_where_the_start_state_left_it() {
    let (n, length, alpha) = (24, 1.0, 0.5);
    let mut sliding = strip(n, length, 1e-3);
    sliding.supports.get_mut("2").unwrap().support_type = "guidedX".into();
    sliding.supports.get_mut("1").unwrap().dry = Some(alpha);
    sliding.supports.get_mut("2").unwrap().dry = Some(-alpha);
    let bent = solve_corotational_2d(&sliding, 50, 1e-10, 10, false).unwrap();
    assert!(bent.converged);
    let end = |r: &AnalysisResults| r.displacements.iter().find(|d| d.node_id == n).unwrap().clone();
    let chord = length * alpha.sin() / alpha;
    assert!((end(&bent.results).ux - (chord - length)).abs() < 1e-4 * length);
    let fixed = clamp(&strip(n, length, 1e-3), alpha, length + end(&bent.results).ux, length);
    let start = CorotationalStart2D { input: &sliding, displacements: &bent.results.displacements };
    let held = solve_corotational_2d_from(&fixed, Some(&start), 50, 1e-10, 2, false).unwrap();
    assert!(held.converged);
    for (a, b) in bent.results.displacements.iter().zip(&held.results.displacements) {
        assert!((a.ux - b.ux).abs() < 1e-9 && (a.uz - b.uz).abs() < 1e-9 && (a.ry - b.ry).abs() < 1e-9);
    }
    let rx = held.results.reactions.iter().find(|r| r.node_id == n).unwrap().rx;
    assert!(rx.abs() < 1e-6 * EI / length.powi(2), "the fixed end pushes with {rx}");
}

fn arc_input(solver: SolverInput, max_steps: usize, ds: f64, max_ds: f64) -> dedaliano_engine::solver::arc_length::ArcLengthInput {
    dedaliano_engine::solver::arc_length::ArcLengthInput { solver, max_steps, max_iter: 40, tolerance: 1e-9, initial_ds: ds, min_ds: 1e-8, max_ds, target_iter: 5 }
}

/// Arc-length driven by prescribed end rotations alone: with the far end
/// sliding, every converged step is the circular arc of its own turn λα, whose
/// chord is L·sin(λα)/(λα).
#[test]
fn validation_arc_length_prescribed_rotations_trace_the_circular_arcs() {
    let (n, length, alpha) = (24, 1.0, 0.8);
    let mut sliding = strip(n, length, 1e-3);
    sliding.supports.get_mut("2").unwrap().support_type = "guidedX".into();
    sliding.supports.get_mut("1").unwrap().dry = Some(alpha);
    sliding.supports.get_mut("2").unwrap().dry = Some(-alpha);
    let r = dedaliano_engine::solver::arc_length::solve_arc_length(&arc_input(sliding, 12, 0.05, 0.05)).unwrap();
    assert!(r.converged && r.steps.len() == 12);
    let mut last = 0.0;
    for step in &r.steps {
        assert!(step.load_factor > last, "the turn grows monotonically");
        last = step.load_factor;
        let turn = step.load_factor * alpha;
        let end = step.displacements.iter().find(|d| d.node_id == n).unwrap();
        let start = step.displacements.iter().find(|d| d.node_id == 0).unwrap();
        assert!((start.ry - turn).abs() < 1e-12 && (end.ry + turn).abs() < 1e-12);
        let chord = length * turn.sin() / turn;
        assert!((length + end.ux - chord).abs() < 2e-4 * length, "step {}: chord {} vs {}", step.step, length + end.ux, chord);
    }
}

/// A strip clamped vertically at both ends half its length apart (a start
/// state reached with co-rotational stages), loaded at midspan with
/// arc-length from that state: the path rises to a limit point and turns, and
/// the limit agrees with the load-controlled bracket around it.
fn unit_strip(n: usize) -> SolverInput {
    let nodes = (0..=n).map(|i| (i, i as f64 / n as f64, 0.0)).collect();
    let elems = (0..n).map(|i| (i, "frame", i, i + 1, 1, 1, false, false)).collect();
    make_input(nodes, vec![(1, 1.0, 0.3)], vec![(1, 100.0, 1e-3)], elems, vec![(1, 0, "fixed"), (2, n, "fixed")], vec![])
}

#[test]
fn validation_arc_length_from_a_prestressed_arch_finds_the_limit_point() {
    let (n, length) = (40, 1.0);
    let half_pi = std::f64::consts::FRAC_PI_2;
    let mut model = unit_strip(n);
    model.supports.get_mut("2").unwrap().support_type = "guidedX".into();
    let mut state: Vec<Displacement> = vec![];
    for k in 1..=16 {
        let mut next = model.clone();
        next.supports.get_mut("1").unwrap().dry = Some(half_pi * k as f64 / 16.0);
        next.supports.get_mut("2").unwrap().dry = Some(-half_pi * k as f64 / 16.0);
        let start = (k > 1).then(|| CorotationalStart2D { input: &model, displacements: &state });
        let r = solve_corotational_2d_from(&next, start.as_ref(), 50, 1e-9, 2, false).unwrap();
        assert!(r.converged);
        state = r.results.displacements;
        model = next;
    }
    let from = length + state.iter().find(|d| d.node_id == n).unwrap().ux;
    for k in 1..=10 {
        let mut next = clamp(&unit_strip(n), half_pi, from + (0.5 * length - from) * k as f64 / 10.0, length);
        next.supports.get_mut("1").unwrap().dry = Some(half_pi);
        let start = CorotationalStart2D { input: &model, displacements: &state };
        let r = solve_corotational_2d_from(&next, Some(&start), 50, 1e-9, 2, false).unwrap();
        assert!(r.converged);
        state = r.results.displacements;
        model = next;
    }
    let mid = |d: &[Displacement]| d.iter().find(|d| d.node_id == n / 2).unwrap().uz;
    assert!(mid(&state) > 0.3 * length, "the clamped strip stands as a tall arch");
    let mut pattern = model.clone();
    for s in pattern.supports.values_mut() {
        s.dx = None;
        s.dry = None;
    }
    let unit = 1.0;
    pattern.loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: n / 2, fx: 0.0, fz: -unit, my: 0.0 })];
    let start = CorotationalStart2D { input: &model, displacements: &state };
    let r = dedaliano_engine::solver::arc_length::solve_arc_length_from(&arc_input(pattern, 760, 0.2, 0.2), Some(&start)).unwrap();
    let peak = r.steps.iter().map(|s| s.load_factor).fold(f64::MIN, f64::max);
    let at_peak = r.steps.iter().position(|s| s.load_factor == peak).unwrap();
    assert!(at_peak + 1 < r.steps.len() && r.steps[at_peak + 1].load_factor < peak, "the path turns at the limit point");
    let load = |p: f64| {
        let mut m = model.clone();
        m.loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: n / 2, fx: 0.0, fz: -p * unit, my: 0.0 })];
        m
    };
    let before = mid(&r.steps[at_peak].displacements);
    let below = solve_corotational_2d_from(&load(0.995 * peak), Some(&start), 60, 1e-9, 40, false).unwrap();
    assert!(below.converged && (mid(&below.results.displacements) - before).abs() < 0.05 * length, "load control stays on the arch just below the limit");
    let above = solve_corotational_2d_from(&load(1.01 * peak), Some(&start), 60, 1e-9, 40, false);
    let jumped = above.map_or(true, |a| !a.converged || (mid(&a.results.displacements) - before).abs() > 0.1 * length);
    assert!(jumped, "1% above the limit the strip cannot stay on the arch");
}
