//! The 2D axial span load (`SolverLoad::AxialDistributed`) on every analysis path that takes
//! 2D loads (second Codex review of #437: "a new load type silently not recovered").
//!
//! Each path is checked against the linear solve, whose answer is closed form here, in the
//! limit where it should agree with it (small loads, one stage, a static load).
//!
//! Model: a 4 m horizontal bar, pinned at node 1, on a horizontal roller at node 2 (free along
//! the bar), pulled at node 2 by 50 kN, with 10 kN/m along it toward node 2. Then
//! N(x) = 50 + 10·(4 − x): 90 at node 1, 50 at node 2, all tension (so a cable takes it too).
use crate::common;
use common::make_input;
use dedaliano_engine::solver::{
    corotational::solve_corotational_2d, linear::solve_2d, moving_loads::solve_moving_loads_2d,
    pdelta::solve_pdelta_2d, staged::solve_staged_2d, time_integration::solve_time_history_2d,
};
use dedaliano_engine::types::*;
use std::collections::HashMap;

fn axial(element_id: usize, q_i: f64, q_j: f64) -> SolverLoad {
    SolverLoad::AxialDistributed(SolverAxialDistributedLoad { element_id, q_i, q_j, a: None, b: None })
}

fn bar(elem_type: &str, scale: f64) -> SolverInput {
    make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, elem_type, 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 50.0 * scale, fz: 0.0, my: 0.0 }),
            axial(1, 10.0 * scale, 10.0 * scale),
        ],
    )
}

fn close(a: f64, b: f64, tol: f64, what: &str) {
    assert!((a - b).abs() <= tol * (1.0 + b.abs()), "{what}: {a} vs {b}");
}

#[test]
fn linear_closed_form() {
    for t in ["truss", "frame"] {
        let f = &solve_2d(&bar(t, 1.0)).unwrap().element_forces[0];
        close(f.n_start, 90.0, 1e-9, t);
        close(f.n_end, 50.0, 1e-9, t);
    }
}

/// Codex: the corotational truss/cable branch reported EA·elongation/L at both ends and no
/// span load, a constant N even in the small-displacement limit.
#[test]
fn corotational_truss_and_cable_recover_the_axial_span_load() {
    for t in ["truss", "cable", "frame"] {
        let input = bar(t, 1e-3);
        let lin = &solve_2d(&input).unwrap().element_forces[0];
        let cr = solve_corotational_2d(&input, 50, 1e-12, 1, false).unwrap();
        assert!(cr.converged, "{t}");
        let f = &cr.results.element_forces[0];
        close(f.n_start, lin.n_start, 1e-6, &format!("{t} n_start"));
        close(f.n_end, lin.n_end, 1e-6, &format!("{t} n_end"));
        assert_eq!(f.distributed_loads_x.len(), 1, "{t}: the diagram needs the span load");
        let mid = dedaliano_engine::postprocess::diagrams::compute_diagram_value_at("axial", 0.5, f);
        close(mid, 0.07, 1e-6, &format!("{t} N(L/2)"));
    }
}

/// Staged construction assembled no member loads on a truss bar at all, so an axial span load
/// on one (which before the axial load type reached it as nodal loads) vanished.
#[test]
fn staged_takes_the_axial_span_load_on_trusses_and_frames() {
    for t in ["truss", "frame"] {
        let s = bar(t, 1.0);
        let staged = StagedInput {
            nodes: s.nodes.clone(),
            materials: s.materials.clone(),
            sections: s.sections.clone(),
            elements: s.elements.clone(),
            supports: s.supports.clone(),
            loads: s.loads.clone(),
            stages: vec![ConstructionStage {
                name: "all".into(),
                elements_added: vec![1],
                elements_removed: vec![],
                load_indices: vec![0, 1],
                supports_added: vec![1, 2],
                supports_removed: vec![],
                prestress_loads: vec![],
            }],
            constraints: vec![],
        };
        let r = solve_staged_2d(&staged).unwrap();
        let f = &r.final_results.element_forces[0];
        close(f.n_start, 90.0, 1e-6, &format!("staged {t} n_start"));
        close(f.n_end, 50.0, 1e-6, &format!("staged {t} n_end"));
        let rx: f64 = r.final_results.reactions.iter().map(|x| x.rx).sum();
        close(rx, -90.0, 1e-6, &format!("staged {t} ΣRx"));
    }
}

/// P-Delta recovers forces through the linear recovery: the same N under a load that bends
/// nothing.
#[test]
fn pdelta_keeps_the_axial_span_load() {
    let input = bar("frame", 1.0);
    let r = solve_pdelta_2d(&input, 20, 1e-10).unwrap();
    let f = &r.results.element_forces[0];
    close(f.n_start, 90.0, 1e-6, "pdelta n_start");
    close(f.n_end, 50.0, 1e-6, "pdelta n_end");
    assert_eq!(f.distributed_loads_x.len(), 1);
}

/// Time history takes the static loads into its force vector: suddenly applied to an undamped
/// bar, the free end swings to twice its static displacement.
#[test]
fn time_history_applies_the_axial_span_load() {
    let input = bar("truss", 1.0);
    let lin = solve_2d(&input).unwrap();
    let u_static = lin.displacements.iter().find(|d| d.node_id == 2).unwrap().ux;
    let th = TimeHistoryInput {
        solver: input,
        densities: HashMap::from([("1".to_string(), 7850.0)]),
        time_step: 1e-5,
        n_steps: 400,
        method: "newmark".into(),
        beta: 0.25,
        gamma: 0.5,
        alpha: None,
        damping_xi: None,
        ground_accel: None,
        ground_direction: None,
        force_history: None,
    };
    let r = solve_time_history_2d(&th).unwrap();
    let peak = r.peak_displacements.iter().find(|d| d.node_id == 2).unwrap().ux.abs();
    // Without the span load the static displacement would be 50/90 of this one's mean.
    assert!(peak > 1.8 * u_static.abs() && peak < 2.2 * u_static.abs(), "peak {peak}, static {u_static}");
}

/// Moving loads keep the permanent axial span load, and their N envelope reads N along the
/// member: under a sign-changing axial load it peaks inside, where the end values miss it.
#[test]
fn moving_loads_keep_the_axial_span_load_and_see_interior_peaks() {
    let solver = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "pinned")],
        vec![axial(1, 10.0, -10.0)],
    );
    // q = 10 − 5x on a bar held axially at both ends: N(x) = N0 − (10x − 2.5x²), mean 0 ⇒ N0 = 20/3;
    // N(0) = N(L) = 20/3, N(2) = 20/3 − 10 = −10/3.
    let lin = &solve_2d(&solver).unwrap().element_forces[0];
    close(lin.n_start, 20.0 / 3.0, 1e-9, "linear N(0)");
    let env = solve_moving_loads_2d(&MovingLoadInput {
        solver,
        train: LoadTrain { name: "tiny".into(), axles: vec![Axle { offset: 0.0, weight: 1e-9 }] },
        step: Some(1.0),
        path_element_ids: Some(vec![1]),
    })
    .unwrap();
    let e = &env.elements["1"];
    close(e.n_max_pos, 20.0 / 3.0, 1e-6, "envelope N+");
    close(e.n_max_neg, -10.0 / 3.0, 1e-6, "envelope N− (interior)");
}

/// A permanent point load on a member is in every moving-load envelope (Codex review of
/// #437): the permanent loads used to be filtered by kind, which dropped member point loads
/// as if they were the train's, and with them the axial part of an inclined load.
#[test]
fn moving_loads_keep_permanent_member_point_loads() {
    let (l, a, p, px) = (4.0, 1.0, -12.0, 8.0);
    let solver = make_input(
        vec![(1, 0.0, 0.0), (2, l, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 2, "rollerX")],
        vec![SolverLoad::PointOnElement(SolverPointLoadOnElement { element_id: 1, a, p, px: Some(px), my: None })],
    );
    let env = solve_moving_loads_2d(&MovingLoadInput {
        solver,
        train: LoadTrain { name: "tiny".into(), axles: vec![Axle { offset: 0.0, weight: 1e-9 }] },
        step: Some(1.0),
        path_element_ids: Some(vec![1]),
    })
    .unwrap();
    let e = &env.elements["1"];
    // Simply supported: |M| peaks under the load, |P|·a·(L − a)/L = 9. The roller takes no
    // axial force, so the pin carries all of px: |N| = |px| = 8 between the pin and the load,
    // 0 past it.
    let m_peak = p.abs() * a * (l - a) / l;
    assert!((e.m_max_pos.abs().max(e.m_max_neg.abs()) - m_peak).abs() < 1e-6, "M envelope {} / {} vs {m_peak}", e.m_max_pos, e.m_max_neg);
    assert!((e.n_max_pos.abs().max(e.n_max_neg.abs()) - px.abs()).abs() < 1e-6, "N envelope {} / {} vs {px}", e.n_max_pos, e.n_max_neg);
}
