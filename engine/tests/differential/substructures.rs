use crate::models::*;
use crate::support::*;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::modal::solve_modal_2d;
use dedaliano_engine::solver::reduction::{guyan_reduce_2d, GuyanInput};
use dedaliano_engine::types::*;
use std::collections::HashMap;
use std::f64::consts::PI;

/// Unconnected parts of one model have a block-diagonal stiffness: solving them
/// together or apart is the same arithmetic up to round-off (1e-9 of each part's
/// own largest displacement, κ(K)·ε with κ < 1e7). Each part is compared against
/// its own scale, so a part with tiny displacements next to a part with large ones
/// is still checked.
const ROUNDOFF: f64 = 1e-9;

fn union_2d(a: &SolverInput, b: &SolverInput) -> SolverInput {
    let mut u = a.clone();
    u.nodes.extend(b.nodes.clone());
    u.materials.extend(b.materials.clone());
    u.sections.extend(b.sections.clone());
    u.elements.extend(b.elements.clone());
    u.supports.extend(b.supports.clone());
    u.loads.extend(b.loads.clone());
    disjoint(a.nodes.len() + b.nodes.len(), u.nodes.len());
    disjoint(a.elements.len() + b.elements.len(), u.elements.len());
    disjoint(a.sections.len() + b.sections.len(), u.sections.len());
    disjoint(a.materials.len() + b.materials.len(), u.materials.len());
    disjoint(a.supports.len() + b.supports.len(), u.supports.len());
    u
}

fn union_3d(a: &SolverInput3D, b: &SolverInput3D) -> SolverInput3D {
    let mut u = a.clone();
    u.nodes.extend(b.nodes.clone());
    u.materials.extend(b.materials.clone());
    u.sections.extend(b.sections.clone());
    u.elements.extend(b.elements.clone());
    u.supports = a.supports.values().chain(b.supports.values()).map(|x| (format!("n{}", x.node_id), x.clone())).collect();
    u.loads.extend(b.loads.clone());
    disjoint(a.nodes.len() + b.nodes.len(), u.nodes.len());
    disjoint(a.elements.len() + b.elements.len(), u.elements.len());
    disjoint(a.sections.len() + b.sections.len(), u.sections.len());
    disjoint(a.materials.len() + b.materials.len(), u.materials.len());
    disjoint(a.supports.len() + b.supports.len(), u.supports.len());
    u
}

fn disjoint(parts: usize, whole: usize) {
    assert_eq!(parts, whole, "the parts share ids: the union would overwrite one with the other");
}

fn same_part_2d(what: &str, part: &AnalysisResults, whole: &AnalysisResults, r: &mut Report) {
    let w: HashMap<usize, &Displacement> = whole.displacements.iter().map(|d| (d.node_id, d)).collect();
    let mut t = Vec::new();
    let mut th = Vec::new();
    for d in &part.displacements {
        let e = w[&d.node_id];
        t.push((format!("node {} ux", d.node_id), Length::from_m(e.ux), Length::from_m(d.ux)));
        t.push((format!("node {} uz", d.node_id), Length::from_m(e.uz), Length::from_m(d.uz)));
        th.push((format!("node {}", d.node_id), Rotation::from_rad(e.ry), Rotation::from_rad(d.ry)));
    }
    r.field(&format!("{what} translation"), &t, ROUNDOFF);
    r.field(&format!("{what} rotation"), &th, ROUNDOFF);
}

fn same_part_3d(what: &str, part: &AnalysisResults3D, whole: &AnalysisResults3D, r: &mut Report) {
    let w: HashMap<usize, &Displacement3D> = whole.displacements.iter().map(|d| (d.node_id, d)).collect();
    let mut t = Vec::new();
    let mut th = Vec::new();
    for d in &part.displacements {
        let e = w[&d.node_id];
        for (c, a, b) in [("ux", e.ux, d.ux), ("uy", e.uy, d.uy), ("uz", e.uz, d.uz)] {
            t.push((format!("node {} {c}", d.node_id), Length::from_m(a), Length::from_m(b)));
        }
        for (c, a, b) in [("rx", e.rx, d.rx), ("ry", e.ry, d.ry), ("rz", e.rz, d.rz)] {
            th.push((format!("node {} {c}", d.node_id), Rotation::from_rad(a), Rotation::from_rad(b)));
        }
    }
    r.field(&format!("{what} translation"), &t, ROUNDOFF);
    r.field(&format!("{what} rotation"), &th, ROUNDOFF);
}

pub fn parts_2d(a: &SolverInput, b: &SolverInput) -> Result<Report, String> {
    let whole = solve_2d(&union_2d(a, b))?;
    let mut r = Report::new();
    same_part_2d("part A", &solve_2d(a)?, &whole, &mut r);
    same_part_2d("part B", &solve_2d(b)?, &whole, &mut r);
    Ok(r)
}

pub fn parts_3d(a: &SolverInput3D, b: &SolverInput3D) -> Result<Report, String> {
    let whole = solve_3d(&union_3d(a, b))?;
    let mut r = Report::new();
    same_part_3d("part A", &solve_3d(a)?, &whole, &mut r);
    same_part_3d("part B", &solve_3d(b)?, &whole, &mut r);
    Ok(r)
}

fn renumbered_2d(s: &SolverInput, offset: usize, dx: f64) -> SolverInput {
    let mut o = s.clone();
    o.nodes = s.nodes.values().map(|n| ((n.id + offset).to_string(), SolverNode { id: n.id + offset, x: n.x + dx, z: n.z })).collect();
    o.materials = s.materials.values().map(|m| ((m.id + offset).to_string(), SolverMaterial { id: m.id + offset, ..m.clone() })).collect();
    o.sections = s.sections.values().map(|c| ((c.id + offset).to_string(), SolverSection { id: c.id + offset, ..c.clone() })).collect();
    o.elements = s.elements.values().map(|e| ((e.id + offset).to_string(), SolverElement {
        id: e.id + offset, node_i: e.node_i + offset, node_j: e.node_j + offset,
        material_id: e.material_id + offset, section_id: e.section_id + offset, ..e.clone()
    })).collect();
    o.supports = s.supports.values().map(|x| ((x.id + offset).to_string(), SolverSupport { id: x.id + offset, node_id: x.node_id + offset, ..x.clone() })).collect();
    o.loads = s.loads.iter().map(|l| match l {
        SolverLoad::Nodal(n) => SolverLoad::Nodal(SolverNodalLoad { node_id: n.node_id + offset, ..n.clone() }),
        SolverLoad::Distributed(d) => SolverLoad::Distributed(SolverDistributedLoad { element_id: d.element_id + offset, ..d.clone() }),
        other => panic!("{other:?}"),
    }).collect();
    o
}

#[test]
fn two_unconnected_frames_solve_as_each_alone() {
    let a = frame_2d(&FrameSpec::two_storey());
    let b = renumbered_2d(&frame_2d(&FrameSpec { storeys: 3, column: (2e-3, 5e-6), ..FrameSpec::two_storey() }), 1000, 50.0);
    agree("2D frames together vs apart", parts_2d(&a, &b));
}

/// #1367's model: a cantilever whose own bending stiffness is real but small next to
/// an unconnected stiff member. Alone, its tip turns θ = PL²/(2EI); beside the
/// stiff member the model-wide orphan-rotation threshold locks it.
fn soft_cantilever_2d(i_soft: f64) -> SolverInput {
    crate::common::make_input(
        vec![(1, 0.0, 0.0), (2, 1.0, 0.0)],
        vec![(1, E_STEEL_MPA, 0.3)],
        vec![(1, 0.01, i_soft)],
        vec![(1, "frame", 1, 2, 1, 1, false, false)],
        vec![(1, 1, "fixed")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -1e-3, my: 0.0 })],
    )
}

fn stiff_member_2d() -> SolverInput {
    crate::common::make_input(
        vec![(3, 0.0, 5.0), (4, 1.0, 5.0)],
        vec![(2, E_STEEL_MPA, 0.3)],
        vec![(2, 1.0, 1e3)],
        vec![(2, "frame", 3, 4, 2, 2, false, false)],
        vec![(2, 3, "fixed")],
        vec![],
    )
}

fn soft_cantilever_3d(i_soft: f64) -> SolverInput3D {
    crate::common::make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 1.0, 0.0, 0.0)],
        vec![(1, E_STEEL_MPA, 0.3)],
        vec![(1, 0.01, i_soft, i_soft, i_soft)],
        vec![(1, "frame", 1, 2, 1, 1)],
        vec![(1, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 0.0, fy: 0.0, fz: -1e-3, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    )
}

fn stiff_member_3d() -> SolverInput3D {
    crate::common::make_3d_input(
        vec![(3, 0.0, 5.0, 0.0), (4, 1.0, 5.0, 0.0)],
        vec![(2, E_STEEL_MPA, 0.3)],
        vec![(2, 1.0, 1e3, 1e3, 1e3)],
        vec![(2, "frame", 3, 4, 2, 2)],
        vec![(3, vec![true; 6])],
        vec![],
    )
}

/// The reference itself: alone, the soft cantilever's tip rotation is the textbook
/// PL²/(2EI) (to round-off), so the disagreement below is the engine's, not the test's.
#[test]
fn soft_cantilever_alone_matches_the_textbook_tip_rotation() {
    let i = 1e-10;
    let expect = Rotation::from_rad(1e-3 / (2.0 * E_STEEL_MPA * 1000.0 * i));
    let r2 = solve_2d(&soft_cantilever_2d(i)).unwrap();
    let r3 = solve_3d(&soft_cantilever_3d(i)).unwrap();
    let mut r = Report::new();
    r.close("2D tip θ", Rotation::from_rad(r2.displacements.iter().find(|d| d.node_id == 2).unwrap().ry.abs()), expect, expect * 1e-9);
    r.close("3D tip θy", Rotation::from_rad(r3.displacements.iter().find(|d| d.node_id == 2).unwrap().ry.abs()), expect, expect * 1e-9);
    agree("soft cantilever vs PL²/2EI", Ok(r));
}

#[test]
fn soft_rotation_is_not_locked_by_an_unconnected_stiff_member_2d() {
    known_issue(1367, "2D soft cantilever with vs without an unconnected stiff member", parts_2d(&soft_cantilever_2d(1e-10), &stiff_member_2d()));
}

#[test]
fn soft_rotation_is_not_locked_by_an_unconnected_stiff_member_3d() {
    known_issue(1367, "3D soft cantilever with vs without an unconnected stiff member", parts_3d(&soft_cantilever_3d(1e-10), &stiff_member_3d()));
}

/// Where the soft member is not under the threshold the parts already agree:
/// the pair above fails for #1367 alone.
#[test]
fn moderately_soft_rotation_beside_a_stiff_member_is_unaffected() {
    agree("2D, I = 1e-4", parts_2d(&soft_cantilever_2d(1e-4), &stiff_member_2d()));
    agree("3D, I = 1e-4", parts_3d(&soft_cantilever_3d(1e-4), &stiff_member_3d()));
}

/// Static condensation keeps the static solution exactly: loads on condensed DOFs
/// are carried to the boundary as `K_bi K_ii⁻¹ f_i` and recovered afterwards.
#[test]
fn guyan_condensation_recovers_the_full_static_solution() {
    let spec = FrameSpec::two_storey();
    let mut s = frame_2d(&spec);
    let beam = first_beam(&s);
    s.loads.push(SolverLoad::Distributed(SolverDistributedLoad { element_id: beam, q_i: -10.0, q_j: -14.0, a: None, b: None }));
    let p = plane_frame(&spec);
    let full = solve_2d(&s).unwrap();
    let mut boundary: Vec<usize> = p.floors.concat();
    boundary.sort_unstable();
    let g = guyan_reduce_2d(&GuyanInput { solver: s.clone(), boundary_nodes: boundary }).unwrap();
    let mut r = Report::new();
    same_part_2d("Guyan", &AnalysisResults { displacements: g.displacements.clone(), ..full.clone() }, &full, &mut r);
    let fr: HashMap<usize, &Reaction> = full.reactions.iter().map(|x| (x.node_id, x)).collect();
    let mut q = Vec::new();
    for x in &g.reactions {
        let y = fr[&x.node_id];
        q.push((format!("node {} Rx", x.node_id), Force::from_kn(x.rx), Force::from_kn(y.rx)));
        q.push((format!("node {} Rz", x.node_id), Force::from_kn(x.rz), Force::from_kn(y.rz)));
    }
    r.field("Guyan reactions", &q, ROUNDOFF);
    let ff: HashMap<usize, &ElementForces> = full.element_forces.iter().map(|x| (x.element_id, x)).collect();
    let mut m = Vec::new();
    for x in &g.element_forces {
        let y = ff[&x.element_id];
        m.push((format!("{} start", x.element_id), Moment::from_kn_m(x.m_start), Moment::from_kn_m(y.m_start)));
        m.push((format!("{} end", x.element_id), Moment::from_kn_m(x.m_end), Moment::from_kn_m(y.m_end)));
    }
    r.field("Guyan member end moments", &m, ROUNDOFF);
    agree("Guyan vs full static", Ok(r));
}

/// Cubic Hermite frame elements are exact at the nodes for nodal and uniform span
/// loads, so splitting every member changes no shared nodal value (round-off only).
#[test]
fn refined_mesh_reproduces_the_coarse_nodal_solution() {
    let coarse_spec = FrameSpec { subdivisions: 1, ..FrameSpec::two_storey() };
    let fine_spec = FrameSpec { subdivisions: 4, ..FrameSpec::two_storey() };
    let mut coarse = frame_2d(&coarse_spec);
    let mut fine = frame_2d(&fine_spec);
    for e in beams(&coarse) {
        coarse.loads.push(SolverLoad::Distributed(SolverDistributedLoad { element_id: e, q_i: -9.0, q_j: -9.0, a: None, b: None }));
    }
    for e in beams(&fine) {
        fine.loads.push(SolverLoad::Distributed(SolverDistributedLoad { element_id: e, q_i: -9.0, q_j: -9.0, a: None, b: None }));
    }
    let rc = solve_2d(&coarse).unwrap();
    let rf = solve_2d(&fine).unwrap();
    let mut r = Report::new();
    same_part_2d("coarse vs fine", &rc, &rf, &mut r);
    agree("refined vs coarse mesh", Ok(r));
}

/// Euler–Bernoulli simply supported beam: ωₙ = (nπ/L)²√(EI/m̄). Hermite elements
/// with consistent mass converge from above at O(h⁴), so halving h divides the
/// error by ~16; the first check is the exact formula, the second the rate.
#[test]
fn modal_mesh_refinement_converges_at_fourth_order() {
    let (l, a, iz) = (8.0, 6.26e-3, 1.17e-4);
    let ei = E_STEEL_MPA * 1000.0 * iz;
    let mbar = STEEL_DENSITY_KG_M3 * a / 1000.0;
    let exact: Vec<f64> = (1..=2).map(|n| (n as f64 * PI / l).powi(2) * (ei / mbar).sqrt() / (2.0 * PI)).collect();
    let mut r = Report::new();
    let mut prev: Option<Vec<f64>> = None;
    for n_el in [4usize, 8, 16] {
        let s = crate::common::make_ss_beam_udl(n_el, l, E_STEEL_MPA, a, iz, 0.0);
        let modal = solve_modal_2d(&s, &steel_densities(), 4).unwrap();
        let bending: Vec<f64> = modal.modes.iter().map(|m| m.frequency).filter(|f| exact.iter().any(|e| (f / e - 1.0).abs() < 0.05)).take(2).collect();
        if bending.len() < 2 {
            r.fail(format!("{n_el} elements: bending modes not found among {:?}", modal.modes.iter().map(|m| m.frequency).collect::<Vec<_>>()));
            continue;
        }
        let err: Vec<f64> = bending.iter().zip(&exact).map(|(f, e)| f / e - 1.0).collect();
        for (k, e) in err.iter().enumerate() {
            if !(*e >= -1e-9) {
                r.fail(format!("{n_el} elements mode {}: below the exact frequency ({e:.3e})", k + 1));
            }
        }
        if let Some(p) = &prev {
            for k in 0..2 {
                if err[k] > 1e-8 {
                    r.close(&format!("{n_el} elements mode {} error ratio", k + 1), LoadFactor::from_factor(p[k] / err[k]), LoadFactor::from_factor(16.0), LoadFactor::from_factor(2.0));
                }
            }
        }
        r.close(&format!("{n_el} elements f1"), Frequency::from_hz(bending[0]), Frequency::from_hz(exact[0]), Frequency::from_hz(exact[0] * 2e-3));
        prev = Some(err);
    }
    agree("modal mesh refinement", Ok(r));
}
