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
