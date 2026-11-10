use crate::common::*;
use dedaliano_engine::element::fiber_beam::{Fiber, FiberMaterial, FiberSectionDef};
use dedaliano_engine::solver::fiber_nonlinear::{
    solve_fiber_nonlinear_2d, solve_fiber_nonlinear_3d, FiberNonlinearInput, FiberNonlinearInput3D, FiberRunStatus,
};
use dedaliano_engine::types::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;
const FY: f64 = 250.0;
const B: f64 = 0.2;
const H: f64 = 0.4;
const L: f64 = 5.0;
const N_EL: usize = 10;
const LAYERS: usize = 40;

fn layered(i: f64, n: usize) -> f64 {
    i * (1.0 - 1.0 / (n * n) as f64)
}

fn ei() -> f64 {
    E * 1000.0 * layered(B * H.powi(3) / 12.0, LAYERS)
}

fn plastic_moment() -> f64 {
    FY * 1000.0 * B * H * H / 4.0
}

fn yield_moment() -> f64 {
    FY * 1000.0 * B * H * H / 6.0
}

fn grid_section(material: FiberMaterial, ny: usize, nz: usize) -> FiberSectionDef {
    let (dy, dz) = (H / ny as f64, B / nz as f64);
    let fibers = (0..ny)
        .flat_map(|i| (0..nz).map(move |j| Fiber {
            y: -H / 2.0 + dy * (i as f64 + 0.5),
            z: -B / 2.0 + dz * (j as f64 + 0.5),
            area: dy * dz,
            material_idx: 0,
        }))
        .collect();
    FiberSectionDef { fibers, materials: vec![material] }
}

fn steel() -> FiberMaterial {
    FiberMaterial::SteelBilinear { e: E, fy: FY, hardening_ratio: 0.0 }
}

fn cantilever_2d(material: FiberMaterial, loads: Vec<SolverLoad>, n_increments: usize) -> FiberNonlinearInput {
    cantilever_2d_mesh(material, loads, n_increments, N_EL)
}

fn cantilever_2d_mesh(material: FiberMaterial, loads: Vec<SolverLoad>, n_increments: usize, n_el: usize) -> FiberNonlinearInput {
    let nodes = (0..=n_el).map(|i| (i + 1, L * i as f64 / n_el as f64, 0.0)).collect();
    let elems = (0..n_el).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
    let solver = make_input(nodes, vec![(1, E, 0.3)], vec![(1, B * H, B * H.powi(3) / 12.0)], elems, vec![(1, 1, "fixed")], loads);
    let mut fiber_sections = HashMap::new();
    fiber_sections.insert("1".to_string(), grid_section(material, LAYERS, 1));
    FiberNonlinearInput { solver, fiber_sections, n_integration_points: 5, max_iter: 50, tolerance: 1e-8, n_increments, modified_nr: false }
}

fn tip_load(p: f64) -> Vec<SolverLoad> {
    tip_load_at(p, N_EL + 1)
}

fn tip_load_at(p: f64, node_id: usize) -> Vec<SolverLoad> {
    vec![SolverLoad::Nodal(SolverNodalLoad { node_id, fx: 0.0, fz: -p, my: 0.0 })]
}

fn tip(result: &AnalysisResults) -> &Displacement {
    result.displacements.iter().find(|d| d.node_id == N_EL + 1).unwrap()
}

fn root(result: &AnalysisResults) -> &Reaction {
    result.reactions.iter().find(|r| r.node_id == 1).unwrap()
}

/// Gere & Timoshenko: elastic–perfectly plastic rectangular cantilever, Py ≤ P < Pu.
fn ep_tip_deflection(p: f64) -> f64 {
    let py = yield_moment() / L;
    let dy = py * L.powi(3) / (3.0 * ei());
    if p <= py {
        return p * L.powi(3) / (3.0 * ei());
    }
    let r = p / py;
    dy / (r * r) * (5.0 - (3.0 + r) * (3.0 - 2.0 * r).sqrt())
}

#[test]
fn elastic_cantilever_matches_closed_form_with_reactions_and_equilibrium() {
    let p = 50.0;
    let r = solve_fiber_nonlinear_2d(&cantilever_2d(FiberMaterial::Elastic { e: E }, tip_load(p), 1)).unwrap();
    assert_eq!(r.status, FiberRunStatus::Complete);
    assert_eq!(r.last_converged_load_factor, 1.0);
    assert_close(tip(&r.results).uz.abs(), p * L.powi(3) / (3.0 * ei()), 1e-6, "tip deflection PL³/3EI");
    let reaction = root(&r.results);
    assert_close(reaction.rz, p, 1e-9, "root vertical reaction");
    assert_close(reaction.my.abs(), p * L, 1e-9, "root moment PL");
    assert!(reaction.rx.abs() < 1e-9 * p);
    let eq = r.results.equilibrium.as_ref().unwrap();
    assert!(eq.residual_ok && eq.equilibrium_ok, "{eq:?}");
    assert!(eq.max_imbalance < 1e-9 * p, "{eq:?}");
}

#[test]
fn pure_moment_is_balanced_through_the_moment_term() {
    let m = 0.5 * yield_moment();
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: N_EL + 1, fx: 0.0, fz: 0.0, my: m })];
    let r = solve_fiber_nonlinear_2d(&cantilever_2d(steel(), loads, 2)).unwrap();
    assert_eq!(r.status, FiberRunStatus::Complete);
    assert_close(tip(&r.results).ry.abs(), m * L / ei(), 1e-6, "tip rotation ML/EI");
    let reaction = root(&r.results);
    assert_close(reaction.my, -m, 1e-9, "root moment balances the applied couple");
    assert!(reaction.rx.abs() < 1e-9 * m && reaction.rz.abs() < 1e-9 * m);
    let eq = r.results.equilibrium.as_ref().unwrap();
    assert!(eq.equilibrium_ok, "{eq:?}");
    assert_close(eq.applied_force_sum[2], m, 1e-9, "applied moment sum");
    assert_close(eq.reaction_force_sum[2], -m, 1e-9, "reaction moment sum");
}

#[test]
fn elastic_plastic_cantilever_follows_the_closed_form_curve() {
    let pu = plastic_moment() / L;
    let r = solve_fiber_nonlinear_2d(&cantilever_2d(steel(), tip_load(0.95 * pu), 19)).unwrap();
    assert_eq!(r.status, FiberRunStatus::Complete);
    assert!(r.fiber_status.iter().any(|s| s.yielded));
    for step in &r.history {
        let p = step.load_factor * 0.95 * pu;
        let got = step.displacements.iter().find(|d| d.node_id == N_EL + 1).unwrap().uz.abs();
        assert_close(got, ep_tip_deflection(p), 0.03, &format!("tip deflection at P = {p:.1} kN"));
    }
    assert_close(root(&r.results).my.abs(), 0.95 * pu * L, 1e-9, "root moment");
}

#[test]
fn load_beyond_collapse_stops_at_the_last_converged_increment() {
    let pu = plastic_moment() / L;
    let p_ref = 1.2 * pu;
    let n = 48;
    let r = solve_fiber_nonlinear_2d(&cantilever_2d(steel(), tip_load(p_ref), n)).unwrap();
    assert!(!r.converged);
    assert_eq!(r.status, FiberRunStatus::Stopped);
    assert!(r.stop_reason.is_some());
    let lambda = r.last_converged_load_factor;
    assert!(lambda < 1.0);
    let carried = lambda * p_ref;
    assert!((carried / pu - 1.0).abs() < 0.05, "carried {carried} kN against Pu = {pu} kN");
    let last = r.history.last().unwrap();
    assert_eq!(last.load_factor, lambda);
    assert!(last.relative_residual < 1e-8);

    let reaction = root(&r.results);
    assert_close(reaction.rz, carried, 1e-9, "reaction equals the carried load, not the requested one");
    assert_close(reaction.my.abs(), carried * L, 1e-9, "root moment at the stop");
    let eq = r.results.equilibrium.as_ref().unwrap();
    assert!(eq.residual_ok && eq.equilibrium_ok, "{eq:?}");

    let steps = r.history.len();
    let replay = solve_fiber_nonlinear_2d(&cantilever_2d(steel(), tip_load(carried), steps)).unwrap();
    assert_eq!(replay.status, FiberRunStatus::Complete);
    assert_close(tip(&r.results).uz, tip(&replay.results).uz, 1e-9, "stopped state is the converged state at λ");
    assert_close(tip(&r.results).uz, last.displacements.iter().find(|d| d.node_id == N_EL + 1).unwrap().uz, 0.0, "history ends at the returned state");
}

#[test]
fn failure_in_the_first_increment_returns_the_unloaded_state() {
    let pu = plastic_moment() / L;
    let r = solve_fiber_nonlinear_2d(&cantilever_2d(steel(), tip_load(2.0 * pu), 1)).unwrap();
    assert_eq!(r.status, FiberRunStatus::Stopped);
    assert!(r.stop_reason.is_some());
    assert_eq!(r.last_converged_load_factor, 0.0);
    assert!(r.history.is_empty());
    assert!(r.results.displacements.iter().all(|d| d.ux == 0.0 && d.uz == 0.0 && d.ry == 0.0));
    assert!(root(&r.results).rz.abs() < 1e-12);
}

fn cantilever_3d(material: FiberMaterial, fy: f64, fz: f64, n_increments: usize) -> FiberNonlinearInput3D {
    let nodes = (0..=N_EL).map(|i| (i + 1, L * i as f64 / N_EL as f64, 0.0, 0.0)).collect();
    let elems = (0..N_EL).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1)).collect();
    let iy = layered(H * B.powi(3) / 12.0, 10);
    let iz = layered(B * H.powi(3) / 12.0, 20);
    let loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: N_EL + 1, fx: 0.0, fy, fz, mx: 0.0, my: 0.0, mz: 0.0, bw: None })];
    let solver = make_3d_input(nodes, vec![(1, E, 0.3)], vec![(1, B * H, iy, iz, 1e-3)], elems, vec![(1, vec![true; 6])], loads);
    let mut fiber_sections = HashMap::new();
    fiber_sections.insert("1".to_string(), grid_section(material, 20, 10));
    FiberNonlinearInput3D { solver, fiber_sections, n_integration_points: 5, max_iter: 50, tolerance: 1e-8, n_increments, modified_nr: false }
}

#[test]
fn elastic_cantilever_3d_matches_closed_form_with_reactions_and_equilibrium() {
    let (py, pz) = (30.0, -20.0);
    let r = solve_fiber_nonlinear_3d(&cantilever_3d(FiberMaterial::Elastic { e: E }, py, pz, 1)).unwrap();
    assert_eq!(r.status, FiberRunStatus::Complete);
    let t = r.results.displacements.iter().find(|d| d.node_id == N_EL + 1).unwrap();
    let ei_z = E * 1000.0 * layered(B * H.powi(3) / 12.0, 20);
    let ei_y = E * 1000.0 * layered(H * B.powi(3) / 12.0, 10);
    assert_close(t.uy, py * L.powi(3) / (3.0 * ei_z), 1e-6, "uy = PL³/3EIz");
    assert_close(t.uz, pz * L.powi(3) / (3.0 * ei_y), 1e-6, "uz = PL³/3EIy");
    let reaction = r.results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(reaction.fy, -py, 1e-9, "Fy reaction");
    assert_close(reaction.fz, -pz, 1e-9, "Fz reaction");
    assert_close(reaction.mz.abs(), py.abs() * L, 1e-9, "Mz reaction");
    assert_close(reaction.my.abs(), pz.abs() * L, 1e-9, "My reaction");
    let eq = r.results.equilibrium.as_ref().unwrap();
    assert!(eq.residual_ok && eq.equilibrium_ok, "{eq:?}");
}

#[test]
fn load_beyond_collapse_3d_stops_at_the_last_converged_increment() {
    let pu = plastic_moment() / L;
    let r = solve_fiber_nonlinear_3d(&cantilever_3d(steel(), 1.2 * pu, 0.0, 48)).unwrap();
    assert_eq!(r.status, FiberRunStatus::Stopped);
    let carried = r.last_converged_load_factor * 1.2 * pu;
    assert!((carried / pu - 1.0).abs() < 0.05, "carried {carried} kN against Pu = {pu} kN");
    let reaction = r.results.reactions.iter().find(|r| r.node_id == 1).unwrap();
    assert_close(-reaction.fy, carried, 1e-9, "reaction equals the carried load");
    let eq = r.results.equilibrium.as_ref().unwrap();
    assert!(eq.residual_ok && eq.equilibrium_ok, "{eq:?}");
}

#[test]
fn collapse_load_converges_to_mp_over_l_as_the_mesh_is_refined() {
    let pu = plastic_moment() / L;
    let gap = |n_el: usize| {
        let r = solve_fiber_nonlinear_2d(&cantilever_2d_mesh(steel(), tip_load_at(1.2 * pu, n_el + 1), 120, n_el)).unwrap();
        assert_eq!(r.status, FiberRunStatus::Stopped);
        (r.last_converged_load_factor * 1.2 * pu / pu - 1.0).abs()
    };
    let (coarse, fine) = (gap(5), gap(20));
    assert!(fine < coarse, "coarse {coarse}, fine {fine}");
    assert!(fine < 0.02, "fine-mesh collapse load off Mp/L by {fine}");
}

#[test]
fn a_constrained_model_is_refused_since_its_global_balance_cannot_be_checked() {
    let mut input = cantilever_2d(FiberMaterial::Elastic { e: E }, tip_load(10.0), 1);
    input.solver.constraints = vec![Constraint::RigidLink(RigidLinkConstraint { master_node: N_EL, slave_node: N_EL + 1, dofs: vec![0, 1, 2] })];
    let err = solve_fiber_nonlinear_2d(&input).err().expect("a constrained fiber model must be refused");
    assert!(err.contains("constraints are not supported"), "{err}");
}

#[test]
fn a_settled_support_with_a_spring_is_refused_before_the_reactions_are_built() {
    let mut input = cantilever_2d(FiberMaterial::Elastic { e: E }, tip_load(20.0), 1);
    for s in input.solver.supports.values_mut() {
        s.kz = Some(5_000.0);
        s.dz = Some(-0.01);
    }
    assert!(solve_fiber_nonlinear_2d(&input).err().is_some_and(|e| serde_json::from_str::<serde_json::Value>(&e).is_ok_and(|v| v["structuredDiagnostics"][0]["code"] == "conflicting_support_spring")));
    let mut input = cantilever_3d(FiberMaterial::Elastic { e: E }, 0.0, -20.0, 1);
    for s in input.solver.supports.values_mut() {
        s.kz = Some(5_000.0);
        s.dz = Some(-0.01);
    }
    assert!(solve_fiber_nonlinear_3d(&input).err().is_some_and(|e| serde_json::from_str::<serde_json::Value>(&e).is_ok_and(|v| v["structuredDiagnostics"][0]["code"] == "conflicting_support_spring")));
}

fn udl_2d(q: f64) -> Vec<SolverLoad> {
    (1..=N_EL).map(|id| SolverLoad::Distributed(SolverDistributedLoad { element_id: id, q_i: -q, q_j: -q, a: None, b: None })).collect()
}

fn root_moment_2d(r: &AnalysisResults) -> f64 {
    r.element_forces.iter().find(|f| f.element_id == 1).unwrap().m_start
}

#[test]
fn a_stopped_run_under_a_distributed_load_reports_member_forces_at_the_carried_load() {
    let qu = 2.0 * plastic_moment() / (L * L);
    let q_ref = 1.2 * qu;
    let r = solve_fiber_nonlinear_2d(&cantilever_2d(steel(), udl_2d(q_ref), 48)).unwrap();
    assert_eq!(r.status, FiberRunStatus::Stopped);
    let carried = r.last_converged_load_factor * q_ref;
    assert!(carried > 0.0 && carried < q_ref);
    assert_close(root_moment_2d(&r.results).abs(), carried * L * L / 2.0, 1e-6, "root moment = q·L²/2 at the carried q");
    for f in &r.results.element_forces {
        assert_close(f.q_i, -carried, 1e-12, "the member's load is the carried one");
    }
    let replay = solve_fiber_nonlinear_2d(&cantilever_2d(steel(), udl_2d(carried), r.history.len())).unwrap();
    assert_eq!(replay.status, FiberRunStatus::Complete);
    let scale = carried * L * L / 2.0;
    for (a, b) in r.results.element_forces.iter().zip(&replay.results.element_forces) {
        for (x, y) in [(a.m_start, b.m_start), (a.m_end, b.m_end), (a.v_start * L, b.v_start * L), (a.v_end * L, b.v_end * L)] {
            assert!((x - y).abs() < 1e-9 * scale, "member {}: {x} against a run to the carried load {y}", a.element_id);
        }
    }
}

#[test]
fn a_first_increment_failure_under_a_distributed_load_carries_no_member_force() {
    let qu = 2.0 * plastic_moment() / (L * L);
    let r = solve_fiber_nonlinear_2d(&cantilever_2d(steel(), udl_2d(2.0 * qu), 1)).unwrap();
    assert_eq!(r.last_converged_load_factor, 0.0);
    for f in &r.results.element_forces {
        assert!([f.n_start, f.n_end, f.v_start, f.v_end, f.m_start, f.m_end, f.q_i, f.q_j].iter().all(|v| v.abs() < 1e-12), "{f:?}");
    }
}

#[test]
fn a_stopped_3d_run_under_a_distributed_load_reports_member_forces_at_the_carried_load() {
    let qu = 2.0 * plastic_moment() / (L * L);
    let q_ref = 1.2 * qu;
    let mut input = cantilever_3d(steel(), 0.0, 0.0, 48);
    input.solver.loads = (1..=N_EL).map(|id| SolverLoad3D::Distributed(SolverDistributedLoad3D {
        element_id: id, q_xi: 0.0, q_xj: 0.0, q_yi: q_ref, q_yj: q_ref, q_zi: 0.0, q_zj: 0.0, a: None, b: None,
    })).collect();
    let r = solve_fiber_nonlinear_3d(&input).unwrap();
    assert_eq!(r.status, FiberRunStatus::Stopped);
    let carried = r.last_converged_load_factor * q_ref;
    assert!(carried > 0.0 && carried < q_ref);
    let first = r.results.element_forces.iter().find(|f| f.element_id == 1).unwrap();
    assert_close(first.mz_start.abs(), carried * L * L / 2.0, 1e-6, "root moment = q·L²/2 at the carried q");
    for f in &r.results.element_forces {
        assert_close(f.q_yi, carried, 1e-12, "the member's load is the carried one");
    }
    let reaction = r.results.reactions.iter().find(|x| x.node_id == 1).unwrap();
    assert_close(-reaction.fy, carried * L, 1e-9, "reaction equals the carried load");
}

fn issue_1576_input(increments: usize) -> FiberNonlinearInput {
    let (b, h, height, elements) = (0.4_f64, 0.5_f64, 3.0_f64, 20);
    let nodes = (0..=elements).map(|i| (i + 1, 0.0, height * i as f64 / elements as f64)).collect();
    let elems = (0..elements).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
    let solver = make_input(nodes, vec![(1, 20_000.0, 0.2)], vec![(1, b * h, b * h.powi(3) / 12.0)], elems, vec![(1, 1, "fixed")], vec![SolverLoad::Nodal(SolverNodalLoad { node_id: elements + 1, fx: 206.190, fz: 0.0, my: 0.0 })]);
    let mut fibers: Vec<Fiber> = (0..40).map(|i| Fiber { y: -h / 2.0 + h / 40.0 * (i as f64 + 0.5), z: 0.0, area: b * h / 40.0, material_idx: 0 }).collect();
    let area = 3.0 * std::f64::consts::PI * 0.032_f64.powi(2) / 4.0;
    for y in [-0.184, 0.184] {
        fibers.push(Fiber { y, z: 0.0, area, material_idx: 1 });
    }
    let section = FiberSectionDef { fibers, materials: vec![
        FiberMaterial::ConcreteHognestad { fc: 20.0, eps_c0: 0.002, eps_cu: 0.004, ft: 0.0 },
        FiberMaterial::SteelBilinear { e: 200_000.0, fy: 420.0, hardening_ratio: 0.01 },
    ] };
    FiberNonlinearInput { solver, fiber_sections: HashMap::from([("1".into(), section)]), n_integration_points: 5, max_iter: if increments == 320 { 100 } else { 40 }, tolerance: 1e-8, n_increments: increments, modified_nr: false }
}

fn issue_1576_section_moment(top: f64) -> f64 {
    let resultant = |c: f64| {
        let strain = |y: f64| -top * (1.0 - (0.25 - y) / c);
        let mut n = 0.0;
        let mut m = 0.0;
        for i in 0..400 {
            let y = -0.25 + 0.5 / 400.0 * (i as f64 + 0.5);
            let compression = -strain(y);
            let stress = if compression <= 0.0 || compression >= 0.004 { 0.0 }
                else if compression <= 0.002 { -20.0 * (2.0 * compression / 0.002 - (compression / 0.002).powi(2)) }
                else { -20.0 * (1.0 - (compression - 0.002) / 0.002) };
            let force = stress * 0.4 * 0.5 / 400.0;
            n += force;
            m -= force * y;
        }
        for y in [-0.184, 0.184] {
            let e = strain(y);
            let stress = if e.abs() <= 420.0 / 200_000.0 { 200_000.0 * e }
                else { e.signum() * (420.0 + 0.01 * 200_000.0 * (e.abs() - 420.0 / 200_000.0)) };
            let force = stress * 3.0 * std::f64::consts::PI * 0.032_f64.powi(2) / 4.0;
            n += force;
            m -= force * y;
        }
        (n, m * 1000.0)
    };
    let (mut lo, mut hi): (f64, f64) = (0.5e-6, 25.0);
    for _ in 0..60 {
        let c = (lo * hi).sqrt();
        if resultant(c).0 < 0.0 { hi = c; } else { lo = c; }
    }
    resultant((lo * hi).sqrt()).1
}

#[test]
#[ignore = "known wrong result: #1576"]
fn rc_load_limit_is_refined_independently_of_the_requested_step_count() {
    let mut limits = Vec::new();
    for increments in [80, 160, 320] {
        let input = issue_1576_input(increments);
        let run = solve_fiber_nonlinear_2d(&input).unwrap();
        eprintln!("#1576 increments={increments}: lambda={} stop={:?}", run.last_converged_load_factor, run.stop_reason);
        assert_eq!(run.status, FiberRunStatus::Stopped);
        assert!(run.results.equilibrium.as_ref().unwrap().residual_ok);
        limits.push(run.last_converged_load_factor);
    }
    for limit in &limits[1..] {
        assert!((limit - limits[0]).abs() <= 1e-8, "step-dependent load limits: {limits:?}");
    }
    let at_crushing = issue_1576_section_moment(0.004);
    let true_peak = (1..=400).map(|i| issue_1576_section_moment(0.02 * i as f64 / 400.0)).fold(0.0_f64, f64::max);
    eprintln!("#1576 independent M-phi: at epsCu={at_crushing}, peak through 0.02={true_peak}");
    assert!((at_crushing / 3.0 - 133.399).abs() < 0.001);
    assert!(true_peak > at_crushing);
    assert!(limits[0] * 206.190 * 3.0 >= true_peak);
}
