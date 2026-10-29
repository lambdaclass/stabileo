//! Nonlinear and special solvers against independent references.
//!
//! Each test states the structure twice: once with the feature the solver
//! handles nonlinearly (a slack brace, a closed gap, a corotational frame in
//! the small-load limit, ...), and once as a plain linear model that is the
//! same structure without the feature (the slack brace removed, the closed
//! gap replaced by the spring and offset it amounts to). The two must agree.

use crate::common;

use common::*;
use dedaliano_engine::solver::contact::*;
use dedaliano_engine::solver::linear;
use dedaliano_engine::types::*;
use std::collections::HashMap;

fn close(a: f64, b: f64, rel: f64, what: &str) {
    let scale = a.abs().max(b.abs()).max(1e-9);
    assert!((a - b).abs() <= rel * scale, "{what}: {a} vs {b} (rel {:.3e})", (a - b).abs() / scale);
}

fn contact_input(solver: SolverInput) -> ContactInput {
    ContactInput {
        solver,
        element_behaviors: HashMap::new(),
        gap_elements: vec![],
        uplift_supports: vec![],
        max_iter: Some(40),
        tolerance: None,
        augmented_lagrangian: None,
        max_flips: None,
        damping_coefficient: None,
        al_max_iter: None,
        contact_type: ContactType::default(),
        node_to_surface_pairs: vec![],
    }
}

/// Compare every displacement, reaction and member force of `got` with `want`
/// (members missing from `want` must carry no force in `got`).
fn same_results_2d(got: &AnalysisResults, want: &AnalysisResults, rel: f64) {
    let umax = want.displacements.iter().map(|d| d.ux.abs().max(d.uz.abs())).fold(0.0, f64::max);
    for w in &want.displacements {
        let g = got.displacements.iter().find(|d| d.node_id == w.node_id).expect("node missing");
        assert!((g.ux - w.ux).abs() <= rel * umax, "node {} ux {} vs {}", w.node_id, g.ux, w.ux);
        assert!((g.uz - w.uz).abs() <= rel * umax, "node {} uz {} vs {}", w.node_id, g.uz, w.uz);
    }
    let rmax = want.reactions.iter().map(|r| r.rx.abs().max(r.rz.abs())).fold(0.0, f64::max);
    for w in &want.reactions {
        let g = got.reactions.iter().find(|r| r.node_id == w.node_id).expect("reaction missing");
        assert!((g.rx - w.rx).abs() <= rel * rmax, "node {} rx {} vs {}", w.node_id, g.rx, w.rx);
        assert!((g.rz - w.rz).abs() <= rel * rmax, "node {} rz {} vs {}", w.node_id, g.rz, w.rz);
        assert!((g.my - w.my).abs() <= rel * rmax.max(1.0), "node {} my {} vs {}", w.node_id, g.my, w.my);
    }
    let fmax = want.element_forces.iter().map(|f| f.n_start.abs().max(f.m_start.abs()).max(f.m_end.abs())).fold(0.0, f64::max);
    for g in &got.element_forces {
        match want.element_forces.iter().find(|f| f.element_id == g.element_id) {
            Some(w) => {
                for (a, b, what) in [(g.n_start, w.n_start, "N"), (g.v_start, w.v_start, "V"), (g.m_start, w.m_start, "Mi"), (g.m_end, w.m_end, "Mj")] {
                    assert!((a - b).abs() <= rel * fmax, "member {} {what} {a} vs {b}", g.element_id);
                }
            }
            None => {
                for v in [g.n_start, g.n_end, g.v_start, g.v_end, g.m_start, g.m_end] {
                    assert!(v.abs() <= rel * fmax, "inactive member {} carries {v}", g.element_id);
                }
            }
        }
    }
}

/// `storeys`-storey, one-bay frame (4 m × 3 m) with both diagonals of every
/// storey as trusses; returns the model and the ids of the braces that run
/// from bottom-right to top-left (shortened by a rightward sway).
fn braced_frame(storeys: usize, base: &str, fx: f64) -> (SolverInput, Vec<usize>) {
    let mut nodes = vec![];
    for s in 0..=storeys {
        nodes.push((2 * s + 1, 0.0, 3.0 * s as f64));
        nodes.push((2 * s + 2, 4.0, 3.0 * s as f64));
    }
    let mut elems = vec![];
    let mut id = 0;
    let mut compressed = vec![];
    for s in 0..storeys {
        let (bl, br, tl, tr) = (2 * s + 1, 2 * s + 2, 2 * s + 3, 2 * s + 4);
        id += 1; elems.push((id, "frame", bl, tl, 1, 1, false, false));
        id += 1; elems.push((id, "frame", br, tr, 1, 1, false, false));
        id += 1; elems.push((id, "frame", tl, tr, 1, 1, false, false));
        id += 1; elems.push((id, "truss", bl, tr, 1, 2, false, false));
        id += 1; elems.push((id, "truss", br, tl, 1, 2, false, false));
        compressed.push(id);
    }
    let loads = (1..=storeys)
        .map(|s| SolverLoad::Nodal(SolverNodalLoad { node_id: 2 * s + 1, fx, fz: -20.0, my: 0.0 }))
        .collect();
    let input = make_input(
        nodes,
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4), (2, 0.002, 1e-8)],
        elems,
        vec![(1, 1, base), (2, 2, base)],
        loads,
    );
    (input, compressed)
}

fn without(input: &SolverInput, ids: &[usize]) -> SolverInput {
    let mut m = input.clone();
    m.elements.retain(|_, e| !ids.contains(&e.id));
    m
}

fn tension_only(ci: &mut ContactInput, ids: &[usize]) {
    for (_, e) in ci.solver.elements.iter() {
        if e.elem_type == "truss" {
            ci.element_behaviors.insert(e.id.to_string(), "tension_only".into());
        }
    }
    let _ = ids;
}

/// A tension-only X-braced frame under sway: the compressed diagonals go
/// slack, and the answer is the linear solve of the frame without them. The
/// contact solver used to return the linear solve of the model as given,
/// slack braces included (both the displacements and the brace forces).
#[test]
fn contact_2d_slack_braces_match_frame_without_them() {
    for storeys in [1, 12] {
        let (model, compressed) = braced_frame(storeys, "pinned", 100.0);
        let mut ci = contact_input(model.clone());
        tension_only(&mut ci, &compressed);
        let r = solve_contact_2d(&ci).unwrap();
        assert!(r.converged, "{storeys} storeys: not converged");
        assert!(!r.results.structured_diagnostics.iter().any(|d| d.phase.as_deref() == Some("NL-13")), "ordinary contact solve must not warn about freezing");
        for &id in &compressed {
            let s = r.element_status.iter().find(|e| e.element_id == id).unwrap();
            assert_eq!(s.status, "inactive", "{storeys} storeys: brace {id}");
        }
        let reference = linear::solve_2d(&without(&model, &compressed)).unwrap();
        same_results_2d(&r.results, &reference, 1e-6);
    }
}

/// The same, with the frame on an inclined roller and a support settlement:
/// the iteration reads the displacements in global axes, and the prescribed
/// displacement enters the solve. Which braces go slack is checked against
/// the reference itself: every brace kept is in tension there, every brace
/// removed would be shortened by it.
#[test]
fn contact_2d_slack_braces_inclined_roller_and_settlement() {
    let (mut model, compressed) = braced_frame(2, "pinned", 100.0);
    for s in model.supports.values_mut() {
        if s.node_id == 2 {
            s.support_type = "inclinedRoller".into();
            s.angle = Some(0.35);
        }
        if s.node_id == 1 {
            s.dz = Some(-0.004);
        }
    }
    let mut ci = contact_input(model.clone());
    tension_only(&mut ci, &compressed);
    let r = solve_contact_2d(&ci).unwrap();
    assert!(r.converged);
    let slack: Vec<usize> = r.element_status.iter().filter(|e| e.status == "inactive").map(|e| e.element_id).collect();
    assert!(!slack.is_empty());
    let reference = linear::solve_2d(&without(&model, &slack)).unwrap();
    same_results_2d(&r.results, &reference, 1e-6);
    for e in model.elements.values().filter(|e| e.elem_type == "truss") {
        let elong = elongation_2d(&model, &reference, e.id);
        if slack.contains(&e.id) {
            assert!(elong < 0.0, "slack brace {} is stretched by the reference ({elong})", e.id);
        } else {
            assert!(elong > 0.0, "active brace {} is shortened by the reference ({elong})", e.id);
        }
    }
}

fn elongation_2d(model: &SolverInput, res: &AnalysisResults, eid: usize) -> f64 {
    let e = model.elements.values().find(|e| e.id == eid).unwrap();
    let node = |id: usize| model.nodes.values().find(|n| n.id == id).unwrap();
    let disp = |id: usize| res.displacements.iter().find(|d| d.node_id == id).unwrap();
    let (ni, nj) = (node(e.node_i), node(e.node_j));
    let (dx, dz) = (nj.x - ni.x, nj.z - ni.z);
    let l = (dx * dx + dz * dz).sqrt();
    ((disp(e.node_j).ux - disp(e.node_i).ux) * dx + (disp(e.node_j).uz - disp(e.node_i).uz) * dz) / l
}

/// Bar 1–2 pushed into a gap (opening g0) to a fixed node 3. With the gap
/// closed, node 2 carries the bar (EA/L) and the gap spring k from the point
/// the gap closes: u = (F + k·g0)/(EA/L + k). The solver used to stiffen
/// the gap from zero displacement (no g0 offset) and then report the linear
/// solve without the gap.
#[test]
fn contact_2d_gap_closes_at_its_opening() {
    let g0 = 0.002;
    let k = 5000.0;
    let f = 500.0;
    let model = make_input(
        vec![(1, 0.0, 0.0), (2, 1.0, 0.0), (3, 1.0 + g0, 0.0)],
        vec![(1, 200.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed"), (2, 3, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: f, fz: 0.0, my: 0.0 })],
    );
    let mut ci = contact_input(model);
    ci.gap_elements.push(GapElement {
        id: 1, node_i: 2, node_j: 3, direction: 0, initial_gap: g0, stiffness: k,
        friction: None, friction_direction: None, friction_coefficient: None,
    });
    let r = solve_contact_2d(&ci).unwrap();
    assert!(r.converged);
    assert_eq!(r.gap_status[0].status, "closed");
    let ea_l = 200.0 * 1000.0 * 0.01 / 1.0;
    let u = (f + k * g0) / (ea_l + k);
    let d2 = r.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    close(d2.ux, u, 1e-9, "node 2 ux");
    let gap_force = k * (u - g0);
    close(r.gap_status[0].force, -gap_force, 1e-9, "gap force");
    let r1 = r.results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    let r3 = r.results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    close(r1.rx, -ea_l * u, 1e-9, "bar support reaction");
    close(r3.rx, -gap_force, 1e-9, "gap support reaction");
    let bar = r.results.element_forces.iter().find(|e| e.element_id == 1).unwrap();
    close(bar.n_start.abs(), ea_l * u, 1e-9, "bar force");
}

/// A slave node hanging g0 above a fixed master segment, pushed down: the
/// penalty acts from the moment of contact, u = −(F + k·g0)/(EA/L + k).
#[test]
fn contact_2d_node_to_surface_closes_at_its_opening() {
    let g0 = 0.01;
    let k = 5000.0;
    let f = 100.0;
    let l = 2.0 - g0;
    let model = make_input(
        vec![(1, 0.0, 2.0), (2, 0.0, g0), (3, -1.0, 0.0), (4, 1.0, 0.0)],
        vec![(1, 200.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed"), (2, 3, "fixed"), (3, 4, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -f, my: 0.0 })],
    );
    let mut ci = contact_input(model);
    ci.contact_type = ContactType::NodeToSurface;
    ci.node_to_surface_pairs.push(NodeToSurfacePair {
        slave_node: 2,
        master_segment: MasterSegment { id: 1, node_a: 3, node_b: 4 },
        stiffness: k,
        friction_coefficient: None,
    });
    let r = solve_contact_2d(&ci).unwrap();
    assert!(r.converged);
    assert_eq!(r.node_to_surface_status[0].status, "closed");
    let ea_l = 200.0 * 1000.0 * 0.01 / l;
    let u = -(f + k * g0) / (ea_l + k);
    let d2 = r.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    close(d2.uz, u, 1e-9, "slave uz");
    close(r.node_to_surface_status[0].normal_force, k * (-u - g0), 1e-9, "contact force");
    let rz: f64 = r.results.reactions.iter().map(|r| r.rz).sum();
    close(rz, f, 1e-9, "vertical equilibrium");
}

/// Uplift (compression-only) supports were kept as two-way restraints. An
/// overturned portal lifts off its windward base: the answer is the linear
/// solve with that base free to rise (fixed → guidedZ), whose own vertical
/// reaction at the lifted base is zero and whose base is above its seat.
#[test]
fn contact_2d_uplift_support_lifts_off() {
    let model = make_input(
        vec![(1, 0.0, 0.0), (2, 6.0, 0.0), (3, 0.0, 4.0), (4, 6.0, 4.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![
            (1, "frame", 1, 3, 1, 1, false, false),
            (2, "frame", 2, 4, 1, 1, false, false),
            (3, "frame", 3, 4, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 2, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 200.0, fz: -10.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: -10.0, my: 0.0 }),
        ],
    );
    let linear_rz1 = linear::solve_2d(&model).unwrap().reactions.iter().find(|r| r.node_id == 1).unwrap().rz;
    assert!(linear_rz1 < 0.0, "the two-way support pulls down ({linear_rz1})");
    let mut ci = contact_input(model.clone());
    ci.uplift_supports = vec![1, 2];
    let r = solve_contact_2d(&ci).unwrap();
    assert!(r.converged);
    let mut lifted = model.clone();
    for s in lifted.supports.values_mut() {
        if s.node_id == 1 {
            s.support_type = "guidedZ".into();
        }
    }
    let want = linear::solve_2d(&lifted).unwrap();
    same_results_2d(&r.results, &want, 1e-9);
    assert!(r.results.displacements.iter().find(|d| d.node_id == 1).unwrap().uz > 0.0);
    let rz: f64 = r.results.reactions.iter().map(|r| r.rz).sum();
    close(rz, 20.0, 1e-9, "vertical equilibrium");
}

/// 3D uplift supports are refused by name rather than kept rigid.
#[test]
fn contact_3d_refuses_uplift_supports() {
    let solver = make_3d_beam(2, 4.0, 200_000.0, 0.3, 0.01, 1e-4, 1e-4, 1e-4,
        vec![true; 6], Some(vec![true; 6]), vec![]);
    let ci = ContactInput3D {
        solver, element_behaviors: HashMap::new(), gap_elements: vec![], uplift_supports: vec![1],
        max_iter: None, tolerance: None, augmented_lagrangian: None, max_flips: None,
        damping_coefficient: None, al_max_iter: None,
    };
    let err = solve_contact_3d(&ci).unwrap_err();
    assert!(err.contains("uplift"), "{err}");
}

/// A closed gap at an inclined roller: the gap acts along global X, and the
/// roller's DOFs are numbered in its own frame, so the gap's spring has to
/// be rotated with K. Reference: the gap (no opening) replaced by a truss
/// along X with EA/d equal to the gap stiffness.
#[test]
fn contact_2d_gap_at_inclined_roller() {
    let k = 20_000.0;
    let d = 0.5;
    let (mut model, _) = braced_frame(1, "pinned", 100.0);
    for s in model.supports.values_mut() {
        if s.node_id == 2 {
            s.support_type = "inclinedRoller".into();
            s.angle = Some(0.35);
        }
    }
    model.nodes.insert("5".into(), SolverNode { id: 5, x: 4.0 + d, z: 0.0 });
    model.supports.insert("3".into(), SolverSupport {
        id: 3, node_id: 5, support_type: "fixed".into(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    });
    let mut ci = contact_input(model.clone());
    ci.gap_elements.push(GapElement {
        id: 1, node_i: 2, node_j: 5, direction: 0, initial_gap: 0.0, stiffness: k,
        friction: None, friction_direction: None, friction_coefficient: None,
    });
    let r = solve_contact_2d(&ci).unwrap();
    assert!(r.converged);
    assert_eq!(r.gap_status[0].status, "closed");

    let mut reference = model.clone();
    reference.sections.insert("3".into(), SolverSection { id: 3, a: k * d / 200_000_000.0, iz: 1e-8, as_y: None });
    reference.elements.insert("99".into(), SolverElement {
        id: 99, elem_type: "truss".into(), node_i: 2, node_j: 5, material_id: 1, section_id: 3,
        hinge_start: false, hinge_end: false,
    });
    let want = linear::solve_2d(&reference).unwrap();
    same_results_2d(&r.results, &want, 1e-9);
}

/// Coulomb sliding of a closed gap: node 2 (top of a 0.5 m cantilever
/// post) is pushed up into a gap to a fixed node and sideways past the
/// friction limit. Sliding, the gap passes μ·N sideways and the post takes
/// the rest: u_x = (F_x − μ·N)/(3EI/L³), with N = k·(u_z − g0) and
/// u_z = (F_z + k·g0)/(EA/L + k). The friction was a stick spring of
/// stiffness μ·k at any load, and its reported force was clamped to μ·N
/// after the fact, so the displacements were those of a stuck contact.
#[test]
fn contact_2d_gap_friction_slides_at_coulomb_limit() {
    let (g0, k, mu, fx, fz) = (0.002, 5000.0, 0.3, 200.0, 500.0);
    let model = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, 0.5), (3, 0.0, 0.5 + g0)],
        vec![(1, 200.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed"), (2, 3, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx, fz, my: 0.0 })],
    );
    let mut ci = contact_input(model);
    ci.gap_elements.push(GapElement {
        id: 1, node_i: 2, node_j: 3, direction: 1, initial_gap: g0, stiffness: k,
        friction: Some(mu), friction_direction: Some(0), friction_coefficient: None,
    });
    let r = solve_contact_2d(&ci).unwrap();
    assert!(r.converged);
    let (ea_l, k_lat) = (200.0 * 1000.0 * 0.01 / 0.5, 3.0 * 200.0 * 1000.0 * 1e-4 / 0.125);
    let uz = (fz + k * g0) / (ea_l + k);
    let n = k * (uz - g0);
    let ux = (fx - mu * n) / k_lat;
    let d2 = r.results.displacements.iter().find(|d| d.node_id == 2).unwrap();
    close(d2.uz, uz, 1e-9, "uz");
    close(d2.ux, ux, 1e-9, "ux (sliding)");
    close(r.gap_status[0].friction_force.abs(), mu * n, 1e-9, "friction force");
    let r3 = r.results.reactions.iter().find(|r| r.node_id == 3).unwrap();
    // The gap pulls node 3 along with the slip; its support holds it back.
    close(r3.rx, -mu * n, 1e-9, "friction reaction at the fixed side");
    let rx: f64 = r.results.reactions.iter().map(|r| r.rx).sum();
    close(rx, -fx, 1e-9, "horizontal equilibrium");
}

// ==================== 3D co-rotational: rigid rotation, releases ====================

use dedaliano_engine::solver::corotational;

/// Fixed-base portal (3 m columns in four members, 4 m beam) with the beam
/// pinned at both ends when `hinged`; sway load `h` and gravity `p` at the
/// beam ends. Node 5 is the top of the left column.
fn portal_2d(h: f64, p: f64, hinged: bool) -> SolverInput {
    let mut nodes = vec![];
    let mut elems = vec![];
    for (c, x) in [(0usize, 0.0), (1, 4.0)] {
        for k in 0..=4 {
            nodes.push((c * 5 + k + 1, x, 0.75 * k as f64));
            if k > 0 {
                let id = c * 4 + k;
                elems.push((id, "frame", c * 5 + k, c * 5 + k + 1, 1, 1, false, false));
            }
        }
    }
    elems.push((9, "frame", 5, 10, 1, 1, hinged, hinged));
    make_input(
        nodes,
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-5)],
        elems,
        vec![(1, 1, "fixed"), (2, 6, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: h, fz: -p, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 10, fx: 0.0, fz: -p, my: 0.0 }),
        ],
    )
}

/// The same portal in 3D, in the vertical plane through the horizontal unit
/// vector `(cx, cy)`; a 2D hinge releases both bending axes.
fn portal_3d(s: &SolverInput, cx: f64, cy: f64) -> SolverInput3D {
    let nodes = s.nodes.values().map(|n| (n.id, n.x * cx, n.x * cy, n.z)).collect();
    let elems = s.elements.values().map(|e| (e.id, "frame", e.node_i, e.node_j, 1, 1)).collect();
    let sups = s.supports.values().map(|sp| (sp.node_id, vec![true; 6])).collect();
    let loads = s
        .loads
        .iter()
        .map(|l| match l {
            SolverLoad::Nodal(n) => SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: n.node_id, fx: n.fx * cx, fy: n.fx * cy, fz: n.fz, mx: 0.0, my: 0.0, mz: 0.0, bw: None,
            }),
            _ => unreachable!(),
        })
        .collect();
    let mut m = make_3d_input(nodes, vec![(1, 200_000.0, 0.3)], vec![(1, 0.01, 1e-5, 1e-5, 2e-5)], elems, sups, loads);
    for e in s.elements.values() {
        let x = m.elements.get_mut(&e.id.to_string()).unwrap();
        (x.release_my_start, x.release_mz_start) = (e.hinge_start, e.hinge_start);
        (x.release_my_end, x.release_mz_end) = (e.hinge_end, e.hinge_end);
    }
    m
}

/// A planar frame solved by the 3D co-rotational solver must reproduce the 2D
/// one, which extracts the chord rotation exactly with atan2. The 3D solver
/// took the rigid rotation as the skew part of R (sin θ, not θ) and balanced
/// the end shears on the undeformed length; with the beam pinned at both ends
/// (columns rotating 0.16 rad) it settled 1.5% further than the 2D solver, and
/// at twice the load (0.5 rad) did not converge. In any vertical plane.
#[test]
fn corotational_3d_planar_portal_matches_2d_with_and_without_releases() {
    for hinged in [false, true] {
        for (h, p) in [(100.0, 300.0), (200.0, 500.0)] {
            let s = portal_2d(h, p, hinged);
            let r2 = corotational::solve_corotational_2d(&s, 100, 1e-8, 20, false).unwrap();
            assert!(r2.converged, "2D hinged={hinged} H={h}");
            for (cx, cy) in [(1.0, 0.0), (0.0, 1.0), (0.6, 0.8)] {
                let r3 = corotational::solve_corotational_3d(&portal_3d(&s, cx, cy), 100, 1e-8, 20, false).unwrap();
                assert!(r3.converged, "3D hinged={hinged} H={h} plane ({cx},{cy})");
                let umax = r2.results.displacements.iter().map(|d| d.ux.abs().max(d.uz.abs())).fold(0.0, f64::max);
                for d2 in &r2.results.displacements {
                    let d3 = r3.results.displacements.iter().find(|d| d.node_id == d2.node_id).unwrap();
                    let what = format!("hinged={hinged} H={h} plane ({cx},{cy}) node {}", d2.node_id);
                    assert!((d3.ux - d2.ux * cx).abs() < 1e-6 * umax, "{what} ux {} vs {}", d3.ux, d2.ux * cx);
                    assert!((d3.uy - d2.ux * cy).abs() < 1e-6 * umax, "{what} uy {} vs {}", d3.uy, d2.ux * cy);
                    assert!((d3.uz - d2.uz).abs() < 1e-6 * umax, "{what} uz {} vs {}", d3.uz, d2.uz);
                }
                for (rx2, rx3) in r2.results.reactions.iter().zip({
                    let mut v = r3.results.reactions.clone();
                    v.sort_by_key(|r| r.node_id);
                    v
                }) {
                    assert_eq!(rx2.node_id, rx3.node_id);
                    close(rx3.fz, rx2.rz, 1e-6, "vertical reaction");
                    close(rx3.fx * cx + rx3.fy * cy, rx2.rx, 1e-6, "horizontal reaction");
                }
            }
        }
    }
}

// ==================== truss-only nodes and connectors ====================

use dedaliano_engine::solver::{arc_length, fiber_nonlinear, material_nonlinear};

fn node_disp<'a>(r: &'a AnalysisResults, id: usize) -> &'a Displacement {
    r.displacements.iter().find(|d| d.node_id == id).unwrap()
}

/// Portal frame with a node 5 hung from both beam ends by two trusses: its
/// rotation is held by nothing (the linear solver puts a tiny artificial
/// stiffness on it).
fn frame_with_truss_node(fx: f64, fz: f64) -> SolverInput {
    make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, 3.0), (3, 4.0, 3.0), (4, 4.0, 0.0), (5, 2.0, 1.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4), (2, 0.002, 1e-8)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false), (2, "frame", 2, 3, 1, 1, false, false), (3, "frame", 3, 4, 1, 1, false, false),
            (4, "truss", 2, 5, 1, 2, false, false), (5, "truss", 3, 5, 1, 2, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 4, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx, fz, my: 0.0 })],
    )
}

fn same_displacements(got: &AnalysisResults, want: &AnalysisResults, rel: f64, what: &str) {
    let umax = want.displacements.iter().map(|d| d.ux.abs().max(d.uz.abs())).fold(0.0, f64::max);
    for w in &want.displacements {
        let g = node_disp(got, w.node_id);
        assert!((g.ux - w.ux).abs() <= rel * umax && (g.uz - w.uz).abs() <= rel * umax,
            "{what}: node {} ({}, {}) vs ({}, {})", w.node_id, g.ux, g.uz, w.ux, w.uz);
    }
}

/// A node reached only by trusses, in a frame: every nonlinear 2D solver
/// refused the model ("singular tangent") that the linear solver answers.
/// Small load: each must reproduce the linear solution.
#[test]
fn nonlinear_2d_solvers_accept_truss_only_nodes() {
    let s = frame_with_truss_node(1.0, -10.0);
    let lin = linear::solve_2d(&s).unwrap();

    let r = corotational::solve_corotational_2d(&s, 50, 1e-10, 1, false).unwrap();
    assert!(r.converged);
    same_displacements(&r.results, &lin, 1e-3, "co-rotational");

    let mi = NonlinearMaterialInput { solver: s.clone(), material_models: HashMap::new(), section_capacities: HashMap::new(), max_iter: 30, tolerance: 1e-10, n_increments: 1 };
    let r = material_nonlinear::solve_nonlinear_material_2d(&mi).unwrap();
    assert!(r.converged);
    same_displacements(&r.results, &lin, 1e-9, "material nonlinear");

    let fi = fiber_nonlinear::FiberNonlinearInput {
        solver: s.clone(), fiber_sections: HashMap::new(), n_integration_points: 5, max_iter: 30, tolerance: 1e-10, n_increments: 1, modified_nr: false,
    };
    let r = fiber_nonlinear::solve_fiber_nonlinear_2d(&fi).unwrap();
    assert!(r.converged);
    same_displacements(&r.results, &lin, 1e-9, "fiber nonlinear");

    let target = node_disp(&lin, 5).uz;
    let dc = arc_length::DisplacementControlInput { solver: s.clone(), control_node: 5, control_dof: 1, target_displacement: target, n_steps: 4, max_iter: 30, tolerance: 1e-10 };
    let r = arc_length::solve_displacement_control(&dc).unwrap();
    assert!(r.converged);
    close(r.final_load_factor, 1.0, 1e-3, "displacement control: load factor at the linear displacement");
    same_displacements(&r.results, &lin, 1e-3, "displacement control");

    let al = arc_length::ArcLengthInput { solver: s, max_steps: 5, max_iter: 30, tolerance: 1e-8, initial_ds: 0.1, min_ds: 1e-6, max_ds: 0.2, target_iter: 5 };
    let r = arc_length::solve_arc_length(&al).unwrap();
    for st in r.steps.iter().filter(|st| st.converged) {
        // Linear range: the reported displacement (first free DOF: node 2,
        // u_x) is proportional to the load.
        close(st.control_displacement, st.load_factor * node_disp(&lin, 2).ux, 1e-3, "arc length: linear path");
    }
    assert!(r.steps.iter().any(|st| st.converged));
}

fn conn(id: usize, i: usize, j: usize, k: [f64; 6]) -> ConnectorElement {
    ConnectorElement { id, node_i: i, node_j: j, k_axial: k[0], k_shear: k[1], k_moment: k[2], k_shear_z: k[3], k_bend_y: k[4], k_bend_z: k[5] }
}

/// 3 m cantilever column (4 members) loaded at its top (node 5) by a large
/// lateral and vertical force; node 10 is a fixed anchor.
fn column_2d(anchor: (f64, f64)) -> SolverInput {
    let mut s = make_input(
        (1..=5).map(|i| (i, 0.0, 0.75 * (i - 1) as f64)).chain([(10, anchor.0, anchor.1)]).collect(),
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-5), (2, 5e-6, 1e-12)],
        (1..=4).map(|i| (i, "frame", i, i + 1, 1, 1, false, false)).collect(),
        vec![(1, 1, "fixed"), (2, 10, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 60.0, fz: -100.0, my: 0.0 })],
    );
    s.supports.get_mut("2").unwrap().support_type = "fixed".into();
    s
}

/// Co-rotational connectors (2D), each against the same structure without
/// it, at large displacement (tip drift ~0.4 m on 3 m), where the linear
/// limit no longer applies:
/// - a tie with length and axial stiffness k = the truss bar of EA/L = k
///   (the spring acts along the current chord);
/// - a connector with length and rotational stiffness only, to a fixed node =
///   a rotational spring support;
/// - a zero-length connector with all three stiffnesses, to a fixed node =
///   a spring support (global axes).
/// They were refused; a shear stiffness on a connector with length still is.
#[test]
fn corotational_2d_connectors_match_their_equivalent_structures() {
    let solve = |s: &SolverInput| {
        let r = corotational::solve_corotational_2d(s, 100, 1e-8, 20, false).unwrap();
        assert!(r.converged);
        r.results
    };
    // Tie from the top to an anchor 4 m away at the base level.
    let k = 200_000.0 * 1000.0 * 5e-6 / 5.0;
    let mut with = column_2d((4.0, 0.0));
    with.connectors.insert("1".into(), conn(1, 5, 10, [k, 0.0, 0.0, 0.0, 0.0, 0.0]));
    let mut bar = column_2d((4.0, 0.0));
    bar.elements.insert("9".into(), SolverElement { id: 9, elem_type: "truss".into(), node_i: 5, node_j: 10, material_id: 1, section_id: 2, hinge_start: false, hinge_end: false });
    let (a, b) = (solve(&with), solve(&bar));
    assert!(node_disp(&b, 5).ux > 0.05, "large displacement: {}", node_disp(&b, 5).ux);
    same_displacements(&a, &b, 1e-8, "tie connector vs truss bar");
    let (ra, rb) = (a.reactions.iter().find(|r| r.node_id == 10).unwrap(), b.reactions.iter().find(|r| r.node_id == 10).unwrap());
    close(ra.rx, rb.rx, 1e-8, "anchor reaction x");
    close(ra.rz, rb.rz, 1e-8, "anchor reaction z");

    // Rotational connector with length to a fixed node = rotational spring.
    let km = 500.0;
    let mut with = column_2d((1.0, 3.0));
    with.connectors.insert("1".into(), conn(1, 5, 10, [0.0, 0.0, km, 0.0, 0.0, 0.0]));
    let mut spring = column_2d((1.0, 3.0));
    spring.supports.insert("3".into(), SolverSupport { id: 3, node_id: 5, support_type: "spring".into(), kx: None, ky: None, kz: Some(km), dx: None, dz: None, dry: None, angle: None });
    let (a, b) = (solve(&with), solve(&spring));
    assert!(node_disp(&b, 5).ux > 0.05);
    same_displacements(&a, &b, 1e-8, "rotational connector vs rotational spring");
    close(node_disp(&a, 5).ry, node_disp(&b, 5).ry, 1e-8, "top rotation");

    // Zero-length connector to a coincident fixed node = spring support.
    let (kx, kz) = (30.0, 400.0);
    let mut with = column_2d((0.0, 3.0));
    with.connectors.insert("1".into(), conn(1, 5, 10, [kx, kz, km, 0.0, 0.0, 0.0]));
    let mut spring = column_2d((0.0, 3.0));
    spring.supports.remove("2");
    spring.nodes.remove("10");
    spring.supports.insert("3".into(), SolverSupport { id: 3, node_id: 5, support_type: "spring".into(), kx: Some(kx), ky: Some(kz), kz: Some(km), dx: None, dz: None, dry: None, angle: None });
    let (a, b) = (solve(&with), solve(&spring));
    assert!(node_disp(&b, 5).ux > 0.05);
    same_displacements(&a, &b, 1e-8, "zero-length connector vs spring support");

    // Shear stiffness across a connector with length: refused by name.
    let mut bad = column_2d((4.0, 0.0));
    bad.connectors.insert("7".into(), conn(7, 5, 10, [k, 10.0, 0.0, 0.0, 0.0, 0.0]));
    let err = corotational::solve_corotational_2d(&bad, 100, 1e-10, 20, false).unwrap_err();
    assert!(err.contains("connector 7") && err.contains("shear"), "{err}");
    let dc = arc_length::DisplacementControlInput { solver: bad.clone(), control_node: 5, control_dof: 0, target_displacement: 0.1, n_steps: 4, max_iter: 30, tolerance: 1e-8 };
    assert!(arc_length::solve_displacement_control(&dc).unwrap_err().contains("connector 7"));
    let al = arc_length::ArcLengthInput { solver: bad, max_steps: 5, max_iter: 30, tolerance: 1e-8, initial_ds: 0.1, min_ds: 1e-6, max_ds: 0.2, target_iter: 5 };
    assert!(arc_length::solve_arc_length(&al).unwrap_err().contains("connector 7"));
}

/// The 3D twin: a tie connector with length = the truss bar of EA/L = k, and
/// a zero-length connector with all six stiffnesses to a fixed node = a
/// spring support, at large displacement (tip loaded in x and y). Bending or
/// shear stiffness on a connector with length is refused.
#[test]
fn corotational_3d_connectors_match_their_equivalent_structures() {
    let column = |anchor: [f64; 3]| {
        let mut s = make_3d_input(
            (1..=5).map(|i| (i, 0.0, 0.0, 0.75 * (i - 1) as f64)).chain([(10, anchor[0], anchor[1], anchor[2])]).collect(),
            vec![(1, 200_000.0, 0.3)],
            vec![(1, 0.01, 1e-5, 2e-5, 1e-5), (2, 0.001, 1e-8, 1e-8, 1e-8)],
            (1..=4).map(|i| (i, "frame", i, i + 1, 1, 1)).collect(),
            vec![(1, vec![true; 6]), (10, vec![true; 6])],
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 5, fx: 60.0, fy: 25.0, fz: -100.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
        );
        s.left_hand = None;
        s
    };
    let solve = |s: &SolverInput3D| {
        let r = corotational::solve_corotational_3d(s, 100, 1e-8, 20, false).unwrap();
        assert!(r.converged);
        r.results
    };
    let same = |a: &AnalysisResults3D, b: &AnalysisResults3D, what: &str| {
        let umax = b.displacements.iter().map(|d| d.ux.abs().max(d.uy.abs()).max(d.uz.abs())).fold(0.0, f64::max);
        assert!(umax > 0.05, "{what}: large displacement ({umax})");
        for w in &b.displacements {
            let g = a.displacements.iter().find(|d| d.node_id == w.node_id).unwrap();
            for (x, y) in [(g.ux, w.ux), (g.uy, w.uy), (g.uz, w.uz), (g.rx, w.rx), (g.ry, w.ry), (g.rz, w.rz)] {
                assert!((x - y).abs() <= 1e-8 * umax.max(1.0), "{what}: node {} {x} vs {y}", w.node_id);
            }
        }
    };
    let k = 200_000.0 * 1000.0 * 0.001 / 5.0;
    let mut with = column([4.0, 0.0, 0.0]);
    with.connectors.insert("1".into(), conn(1, 5, 10, [k, 0.0, 0.0, 0.0, 0.0, 0.0]));
    let mut bar = column([4.0, 0.0, 0.0]);
    let mut e = bar.elements["1"].clone();
    (e.id, e.elem_type, e.node_i, e.node_j, e.section_id) = (9, "truss".into(), 5, 10, 2);
    bar.elements.insert("9".into(), e);
    same(&solve(&with), &solve(&bar), "tie connector vs truss bar");

    let ks = [30.0, 40.0, 400.0, 300.0, 200.0, 100.0]; // x, y, z, rx, ry, rz
    let mut with = column([0.0, 0.0, 3.0]);
    // Zero-length: local x = global X, local y = −Z, local z = +Y (the
    // connector's frame for a global-x axis), so bending about local y is
    // about Z and about local z is about Y.
    with.connectors.insert("1".into(), conn(1, 5, 10, [ks[0], ks[2], ks[3], ks[1], ks[5], ks[4]]));
    let mut spring = column([0.0, 0.0, 3.0]);
    spring.nodes.remove("10");
    spring.supports.retain(|_, s| s.node_id != 10);
    let mut sp = spring.supports.values().next().unwrap().clone();
    sp.node_id = 5;
    (sp.rx, sp.ry, sp.rz, sp.rrx, sp.rry, sp.rrz) = (false, false, false, false, false, false);
    (sp.kx, sp.ky, sp.kz, sp.krx, sp.kry, sp.krz) = (Some(ks[0]), Some(ks[1]), Some(ks[2]), Some(ks[3]), Some(ks[4]), Some(ks[5]));
    spring.supports.insert("9".into(), sp);
    same(&solve(&with), &solve(&spring), "zero-length connector vs spring support");

    let mut bad = column([4.0, 0.0, 0.0]);
    bad.connectors.insert("7".into(), conn(7, 5, 10, [k, 0.0, 0.0, 0.0, 5.0, 0.0]));
    let err = corotational::solve_corotational_3d(&bad, 100, 1e-10, 20, false).unwrap_err();
    assert!(err.contains("connector 7"), "{err}");
}

/// 3D co-rotational member end forces with member loads, in the small-load
/// limit, against the linear solver: a spatial portal with a uniform load (in
/// both local planes, partial on one member, axial on a column), a point
/// load on the beam and a released beam end. The member loads' fixed-end
/// forces were left out (a fixed-ended beam reported end moments qL²/12 and
/// end shears qL/2 short) and the diagrams had no load.
#[test]
fn corotational_3d_member_forces_include_member_loads() {
    let mut s = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, 3.0), (3, 4.0, 1.0, 3.0), (4, 4.0, 1.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4, 2e-4, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1), (2, "frame", 2, 3, 1, 1), (3, "frame", 3, 4, 1, 1)],
        vec![(1, vec![true; 6]), (4, vec![true; 6])],
        vec![
            SolverLoad3D::Distributed(SolverDistributedLoad3D { q_xi: 0.0, q_xj: 0.0, element_id: 2, q_yi: 0.2, q_yj: 0.4, q_zi: -1.0, q_zj: -1.5, a: None, b: None }),
            SolverLoad3D::Distributed(SolverDistributedLoad3D { q_xi: 0.3, q_xj: 0.3, element_id: 1, q_yi: 0.5, q_yj: 0.5, q_zi: 0.0, q_zj: 0.0, a: Some(0.5), b: Some(2.0) }),
            SolverLoad3D::PointOnElement(SolverPointLoad3D { element_id: 2, a: 1.5, py: 0.3, pz: -2.0 }),
            SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 0.5, fy: 0.2, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None }),
        ],
    );
    s.elements.get_mut("2").unwrap().release_mz_end = true;
    let lin = linear::solve_3d(&s).unwrap();
    let co = corotational::solve_corotational_3d(&s, 50, 1e-10, 1, false).unwrap();
    assert!(co.converged);
    let fmax = lin.element_forces.iter().flat_map(|f| [f.my_start, f.my_end, f.mz_start, f.mz_end, f.vz_start]).fold(0.0f64, |a, b| a.max(b.abs()));
    for l in &lin.element_forces {
        let c = co.results.element_forces.iter().find(|f| f.element_id == l.element_id).unwrap();
        for (a, b, what) in [
            (c.n_start, l.n_start, "N_i"), (c.n_end, l.n_end, "N_j"), (c.vy_start, l.vy_start, "Vy_i"), (c.vy_end, l.vy_end, "Vy_j"),
            (c.vz_start, l.vz_start, "Vz_i"), (c.vz_end, l.vz_end, "Vz_j"), (c.mx_start, l.mx_start, "Mx_i"), (c.mx_end, l.mx_end, "Mx_j"),
            (c.my_start, l.my_start, "My_i"), (c.my_end, l.my_end, "My_j"), (c.mz_start, l.mz_start, "Mz_i"), (c.mz_end, l.mz_end, "Mz_j"),
        ] {
            assert!((a - b).abs() < 1e-3 * fmax, "member {} {what}: {a} vs {b}", l.element_id);
        }
        assert_eq!(c.distributed_loads_z.len(), l.distributed_loads_z.len(), "member {} diagram loads", l.element_id);
        assert_eq!(c.point_loads_z.len(), l.point_loads_z.len());
        assert_eq!((c.q_zi, c.q_zj), (l.q_zi, l.q_zj));
    }
}

// ==================== unconverged incremental solves ====================

/// Shallow two-bar truss (von Mises truss) loaded at its apex beyond its
/// limit point under load control: the solve cannot converge past it.
fn von_mises_truss(p: f64) -> SolverInput {
    make_input(
        vec![(1, 0.0, 0.0), (2, 1.0, 0.1), (3, 2.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.001, 1e-8)],
        vec![(1, "truss", 1, 2, 1, 1, false, false), (2, "truss", 2, 3, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -p, my: 0.0 })],
    )
}

/// An unconverged co-rotational solve returned the iterate it gave up on (no
/// equilibrium state at all) with reactions computed against the full load.
/// It now returns the last converged increment and its load factor, with
/// reactions and forces under the load that increment carries: the same
/// state as a converged solve of the model at that load.
#[test]
fn corotational_unconverged_reports_last_converged_increment() {
    let r = corotational::solve_corotational_2d(&von_mises_truss(400.0), 30, 1e-10, 10, false).unwrap();
    assert!(!r.converged);
    assert!(r.load_factor > 0.0 && r.load_factor < 1.0, "load factor {}", r.load_factor);
    let k = (r.load_factor * 10.0).round() as usize;
    let at = corotational::solve_corotational_2d(&von_mises_truss(400.0 * r.load_factor), 30, 1e-10, k, false).unwrap();
    assert!(at.converged);
    close(node_disp(&r.results, 2).uz, node_disp(&at.results, 2).uz, 1e-9, "apex displacement");
    let rz: f64 = r.results.reactions.iter().map(|x| x.rz).sum();
    close(rz, 400.0 * r.load_factor, 1e-6, "vertical equilibrium at the converged load");
    for (a, b) in r.results.element_forces.iter().zip(at.results.element_forces.iter()) {
        close(a.n_start, b.n_start, 1e-9, "bar force");
    }
    // Converged: the whole load.
    let ok = corotational::solve_corotational_2d(&von_mises_truss(40.0), 30, 1e-10, 10, false).unwrap();
    assert!(ok.converged);
    assert_eq!(ok.load_factor, 1.0);

    // 3D: the same truss in the XZ plane, held out of plane.
    let mk3 = |p: f64| {
        make_3d_input(
            vec![(1, 0.0, 0.0, 0.0), (2, 1.0, 0.0, 0.1), (3, 2.0, 0.0, 0.0)],
            vec![(1, 200_000.0, 0.3)],
            vec![(1, 0.001, 1e-8, 1e-8, 1e-8)],
            vec![(1, "truss", 1, 2, 1, 1), (2, "truss", 2, 3, 1, 1)],
            vec![(1, vec![true, true, true, false, false, false]), (3, vec![true, true, true, false, false, false]), (2, vec![false, true, false, false, false, false])],
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 0.0, fy: 0.0, fz: -p, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
        )
    };
    let r = corotational::solve_corotational_3d(&mk3(400.0), 30, 1e-10, 10, false).unwrap();
    assert!(!r.converged);
    assert!(r.load_factor > 0.0 && r.load_factor < 1.0);
    let k = (r.load_factor * 10.0).round() as usize;
    let at = corotational::solve_corotational_3d(&mk3(400.0 * r.load_factor), 30, 1e-10, k, false).unwrap();
    assert!(at.converged);
    let uz = |res: &AnalysisResults3D| res.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;
    close(uz(&r.results), uz(&at.results), 1e-9, "3D apex displacement");
    let fz: f64 = r.results.reactions.iter().map(|x| x.fz).sum();
    close(fz, 400.0 * r.load_factor, 1e-6, "3D vertical equilibrium at the converged load");
}

/// Under a small load the co-rotational solve could not reach a tight
/// tolerance: the elongation, a difference of two lengths, carried a rounding
/// error of order ε·L, i.e. an axial-force residual of order ε·EA (2e-7 kN on
/// a 0.001 kN load). It now converges and matches the linear solution.
#[test]
fn corotational_small_load_converges_to_tight_tolerance() {
    let s2 = make_input(
        vec![(1, 0.0, 0.0), (2, 1.5, 0.0), (3, 3.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false), (2, "frame", 2, 3, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -0.001, my: 0.0 })],
    );
    let r = corotational::solve_corotational_2d(&s2, 50, 1e-10, 1, false).unwrap();
    assert!(r.converged, "2D did not converge in {} iterations", r.iterations);
    close(node_disp(&r.results, 3).uz, node_disp(&linear::solve_2d(&s2).unwrap(), 3).uz, 1e-6, "2D tip");

    let s3 = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 3.0, 0.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4, 1e-4, 1e-4)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 0.0, fy: 0.0, fz: -0.001, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );
    let r = corotational::solve_corotational_3d(&s3, 50, 1e-10, 1, false).unwrap();
    assert!(r.converged, "3D did not converge in {} iterations", r.iterations);
    let uz = |res: &AnalysisResults3D| res.displacements.iter().find(|d| d.node_id == 2).unwrap().uz;
    close(uz(&r.results), uz(&linear::solve_3d(&s3).unwrap()), 1e-6, "3D tip");
}
