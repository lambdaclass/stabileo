use crate::models::*;
use crate::support::*;
use dedaliano_engine::element::compute_local_axes_3d;
use dedaliano_engine::solver::buckling::{solve_buckling_2d, solve_buckling_3d, BucklingResult3D};
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::modal::{solve_modal_2d, solve_modal_3d, ModalResult3D};
use dedaliano_engine::solver::pdelta::{solve_pdelta_2d, solve_pdelta_3d, PDeltaResult3D};
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// The same discrete equations on both sides, assembled and solved in a different
/// order: they differ by round-off, about κ(K)·ε. These frames have κ(K) < 1e7, so
/// 1e-9 of each field's largest value; eigenvalues are better conditioned than that.
const ROUNDOFF: f64 = 1e-9;

/// In-plane transverse direction (−sin, 0, cos) of a member, on its 3D local y and z.
fn transverse(s: &SolverInput, eid: usize) -> (f64, f64) {
    let e = &s.elements[&eid.to_string()];
    let (a, b) = (&s.nodes[&e.node_i.to_string()], &s.nodes[&e.node_j.to_string()]);
    let l = (b.x - a.x).hypot(b.z - a.z);
    let (c, sn) = ((b.x - a.x) / l, (b.z - a.z) / l);
    let (_, ey, ez) = compute_local_axes_3d(a.x, 0.0, a.z, b.x, 0.0, b.z, None, None, None, None, false);
    let t = [-sn, 0.0, c];
    (ey[0] * t[0] + ey[2] * t[2], ez[0] * t[0] + ez[2] * t[2])
}

/// The plane frame in the XZ plane of a 3D model with every out-of-plane DOF
/// (uy, θx, θz) restrained: the 2D rotation is −θy and a 2D moment is −My.
/// Iy = Iz so the in-plane bending stiffness does not depend on which local axis
/// lies in the plane.
pub fn embed(s: &SolverInput) -> SolverInput3D {
    let nodes = s.nodes.values().map(|n| (n.id.to_string(), SolverNode3D { id: n.id, x: n.x, y: 0.0, z: n.z })).collect();
    let sections = s
        .sections
        .values()
        .map(|c| {
            (c.id.to_string(), SolverSection3D {
                id: c.id, name: None, a: c.a, iy: c.iz, iz: c.iz, j: c.iz, cw: None, as_y: c.as_y, as_z: c.as_y,
                shear_center_y: None, shear_center_z: None,
            })
        })
        .collect();
    let elements = s
        .elements
        .values()
        .map(|e| {
            (e.id.to_string(), SolverElement3D {
                id: e.id, elem_type: e.elem_type.clone(), node_i: e.node_i, node_j: e.node_j,
                material_id: e.material_id, section_id: e.section_id,
                release_my_start: e.hinge_start, release_my_end: e.hinge_end,
                release_mz_start: e.hinge_start, release_mz_end: e.hinge_end,
                release_t_start: false, release_t_end: false,
                local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
            })
        })
        .collect();
    let by_node: HashMap<usize, &SolverSupport> = s.supports.values().map(|x| (x.node_id, x)).collect();
    let supports = s
        .nodes
        .values()
        .map(|n| {
            let (x, z, r) = match by_node.get(&n.id).map(|x| x.support_type.as_str()) {
                Some("fixed") => (true, true, true),
                Some("pinned") => (true, true, false),
                Some("rollerX") => (false, true, false),
                Some("rollerZ") => (true, false, false),
                None => (false, false, false),
                Some(t) => panic!("support {t} has no embedding here"),
            };
            (n.id.to_string(), SolverSupport3D {
                node_id: n.id, rx: x, ry: true, rz: z, rrx: true, rry: r, rrz: true,
                kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
                dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
                normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
            })
        })
        .collect();
    let loads = s
        .loads
        .iter()
        .map(|l| match l {
            SolverLoad::Nodal(n) => SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: n.node_id, fx: n.fx, fy: 0.0, fz: n.fz, mx: 0.0, my: -n.my, mz: 0.0, bw: None,
            }),
            SolverLoad::Distributed(d) => {
                let (cy, cz) = transverse(s, d.element_id);
                SolverLoad3D::Distributed(SolverDistributedLoad3D {
                    element_id: d.element_id, q_xi: 0.0, q_xj: 0.0,
                    q_yi: cy * d.q_i, q_yj: cy * d.q_j, q_zi: cz * d.q_i, q_zj: cz * d.q_j, a: d.a, b: d.b,
                })
            }
            other => panic!("load {other:?} has no embedding here"),
        })
        .collect();
    SolverInput3D {
        solver_options: None, masses: Default::default(), nodes, materials: s.materials.clone(), sections, elements, supports, loads,
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(), curved_beams: vec![], connectors: HashMap::new(),
    }
}

fn len(v: f64) -> Length {
    Length::from_m(v)
}

fn compare_static(s: &SolverInput, r2: &AnalysisResults, r3: &AnalysisResults3D, rel: f64, r: &mut Report) {
    let d3: HashMap<usize, &Displacement3D> = r3.displacements.iter().map(|d| (d.node_id, d)).collect();
    let mut ux = Vec::new();
    let mut uz = Vec::new();
    let mut th = Vec::new();
    let mut oop = Vec::new();
    for d in &r2.displacements {
        let e = d3[&d.node_id];
        ux.push((format!("node {}", d.node_id), len(e.ux), len(d.ux)));
        uz.push((format!("node {}", d.node_id), len(e.uz), len(d.uz)));
        th.push((format!("node {}", d.node_id), Rotation::from_rad(-e.ry), Rotation::from_rad(d.ry)));
        oop.push((format!("node {} uy", d.node_id), len(e.uy), len(0.0)));
    }
    let umax = ux.iter().chain(&uz).map(|p| p.2.in_m().abs()).fold(0.0, f64::max);
    r.field("ux", &ux, rel);
    r.field("uz", &uz, rel);
    r.field("θ", &th, rel);
    for (what, a, _) in oop {
        r.close(&what, a, len(0.0), len(rel * umax));
    }

    let q3: HashMap<usize, &Reaction3D> = r3.reactions.iter().map(|x| (x.node_id, x)).collect();
    let (mut fx, mut fz, mut my) = (Vec::new(), Vec::new(), Vec::new());
    for x in &r2.reactions {
        let Some(y) = q3.get(&x.node_id) else {
            r.fail(format!("3D has no reaction at node {}", x.node_id));
            continue;
        };
        fx.push((format!("node {}", x.node_id), Force::from_kn(y.fx), Force::from_kn(x.rx)));
        fz.push((format!("node {}", x.node_id), Force::from_kn(y.fz), Force::from_kn(x.rz)));
        my.push((format!("node {}", x.node_id), Moment::from_kn_m(-y.my), Moment::from_kn_m(x.my)));
    }
    let fmax = fx.iter().chain(&fz).map(|p| p.2.in_kn().abs()).fold(0.0, f64::max);
    r.field("Rx", &fx, rel);
    r.field("Rz", &fz, rel);
    r.field("M reaction", &my, rel);
    let reactions_2d: Vec<usize> = r2.reactions.iter().map(|x| x.node_id).collect();
    for y in r3.reactions.iter().filter(|y| !reactions_2d.contains(&y.node_id)) {
        r.close(&format!("in-plane reaction at node {} (none in 2D)", y.node_id), Force::from_kn(y.fx.hypot(y.fz)), Force::from_kn(0.0), Force::from_kn(rel * fmax));
    }

    let f3: HashMap<usize, &ElementForces3D> = r3.element_forces.iter().map(|x| (x.element_id, x)).collect();
    let (mut n, mut v, mut m) = (Vec::new(), Vec::new(), Vec::new());
    for x in &r2.element_forces {
        let y = f3[&x.element_id];
        let (cy, cz) = transverse(s, x.element_id);
        let id = x.element_id;
        n.push((format!("{id} start"), Force::from_kn(y.n_start), Force::from_kn(x.n_start)));
        n.push((format!("{id} end"), Force::from_kn(y.n_end), Force::from_kn(x.n_end)));
        v.push((format!("{id} start"), Force::from_kn(cy * y.vy_start + cz * y.vz_start), Force::from_kn(x.v_start)));
        v.push((format!("{id} end"), Force::from_kn(cy * y.vy_end + cz * y.vz_end), Force::from_kn(x.v_end)));
        m.push((format!("{id} start"), Moment::from_kn_m(cy * y.mz_start - cz * y.my_start), Moment::from_kn_m(x.m_start)));
        m.push((format!("{id} end"), Moment::from_kn_m(cy * y.mz_end - cz * y.my_end), Moment::from_kn_m(x.m_end)));
    }
    r.field("N", &n, rel);
    r.field("V", &v, rel);
    r.field("M", &m, rel);
}

pub fn linear_pair(s: &SolverInput) -> Result<Report, String> {
    linear_pair_with(s, |_| {})
}

fn linear_pair_with(s: &SolverInput, perturb: impl FnOnce(&mut AnalysisResults3D)) -> Result<Report, String> {
    let r2 = solve_2d(s)?;
    let mut r3 = solve_3d(&embed(s))?;
    perturb(&mut r3);
    let mut r = Report::new();
    compare_static(s, &r2, &r3, ROUNDOFF, &mut r);
    Ok(r)
}

pub fn pdelta_pair(s: &SolverInput) -> Result<Report, String> {
    pdelta_pair_with(s, |_| {})
}

fn pdelta_pair_with(s: &SolverInput, perturb: impl FnOnce(&mut PDeltaResult3D)) -> Result<Report, String> {
    let p2 = solve_pdelta_2d(s, 50, 1e-12)?;
    let mut p3 = solve_pdelta_3d(&embed(s), 50, 1e-12)?;
    perturb(&mut p3);
    let mut r = Report::new();
    if !(p2.converged && p3.converged) {
        r.fail(format!("converged: 2D {} 3D {}", p2.converged, p3.converged));
    }
    compare_static(s, &p2.results, &p3.results, 1e-8, &mut r);
    Ok(r)
}

pub fn modal_pair(s: &SolverInput, n_modes: usize) -> Result<Report, String> {
    modal_pair_with(s, n_modes, |_| {})
}

fn modal_pair_with(s: &SolverInput, n_modes: usize, perturb: impl FnOnce(&mut ModalResult3D)) -> Result<Report, String> {
    let m2 = solve_modal_2d(s, &steel_densities(), n_modes)?;
    let mut m3 = solve_modal_3d(&embed(s), &steel_densities(), n_modes)?;
    perturb(&mut m3);
    let mut r = Report::new();
    if m2.modes.len() != m3.modes.len() {
        r.fail(format!("{} modes in 2D, {} in 3D", m2.modes.len(), m3.modes.len()));
    }
    for (i, (a, b)) in m3.modes.iter().zip(&m2.modes).enumerate() {
        let f = Frequency::from_hz(b.frequency);
        r.close(&format!("mode {} frequency", i + 1), Frequency::from_hz(a.frequency), f, f * ROUNDOFF);
    }
    Ok(r)
}

pub fn buckling_pair(s: &SolverInput) -> Result<Report, String> {
    buckling_pair_with(s, |_| {})
}

fn buckling_pair_with(s: &SolverInput, perturb: impl FnOnce(&mut BucklingResult3D)) -> Result<Report, String> {
    let b2 = solve_buckling_2d(s, 3)?;
    let mut b3 = solve_buckling_3d(&embed(s), 3)?;
    perturb(&mut b3);
    let mut r = Report::new();
    if b2.modes.len() != b3.modes.len() {
        r.fail(format!("{} buckling modes in 2D, {} in 3D", b2.modes.len(), b3.modes.len()));
    }
    for (i, (a, b)) in b3.modes.iter().zip(&b2.modes).enumerate() {
        let f = LoadFactor::from_factor(b.load_factor);
        r.close(&format!("buckling mode {} factor", i + 1), LoadFactor::from_factor(a.load_factor), f, f * 1e-8);
    }
    if b2.modes.is_empty() {
        r.fail("no 2D buckling mode".into());
    }
    Ok(r)
}

fn with_span_loads(mut s: SolverInput) -> SolverInput {
    for (k, id) in beams(&s).into_iter().enumerate() {
        s.loads.push(SolverLoad::Distributed(SolverDistributedLoad { element_id: id, q_i: -8.0 - k as f64, q_j: -12.0, a: None, b: None }));
    }
    s.loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: 0.0, my: 7.5 }));
    s
}

#[test]
fn planar_frame_2d_matches_3d_static() {
    let mut s = with_span_loads(frame_2d(&FrameSpec::two_storey()));
    agree("2D vs 3D linear static, fixed bases", linear_pair(&s));
    let hinged = first_beam(&s);
    s.elements.get_mut(&hinged.to_string()).unwrap().hinge_start = true;
    agree("2D vs 3D linear static, a hinged beam end", linear_pair(&s));
}

#[test]
fn planar_frame_2d_matches_3d_modal() {
    agree("2D vs 3D modal frequencies", modal_pair(&frame_2d(&FrameSpec::two_storey()), 6));
}

#[test]
fn planar_frame_2d_matches_3d_buckling_and_pdelta() {
    let s = frame_2d(&FrameSpec { gravity_kn: 400.0, ..FrameSpec::two_storey() });
    agree("2D vs 3D buckling factor", buckling_pair(&s));
    agree("2D vs 3D P-delta", pdelta_pair(&s));
}

#[test]
#[ignore = "nightly: make test.engine.differential.full"]
fn planar_2d_matches_3d_on_frame_family() {
    for seed in 0..40 {
        let spec = FrameSpec::variant(seed);
        let s = with_span_loads(frame_2d(&spec));
        agree(&format!("linear, frame {seed} {spec:?}"), linear_pair(&s));
        agree(&format!("modal, frame {seed} {spec:?}"), modal_pair(&s, 4));
        agree(&format!("buckling, frame {seed} {spec:?}"), buckling_pair(&s));
        agree(&format!("P-delta, frame {seed} {spec:?}"), pdelta_pair(&s));
    }
}

#[test]
fn seeded_failure_planar_static_and_pdelta() {
    let s = frame_2d(&FrameSpec::two_storey());
    for nonlinear in [false, true] {
        let check = |field: Option<usize>| {
            let perturb = |r: &mut AnalysisResults3D| {
                let Some(field) = field else { return };
                for d in &mut r.displacements {
                    match field { 0 => d.ux *= -1.0, 1 => d.uz *= -1.0, 2 => d.ry *= -1.0, _ => {} }
                }
                for d in &mut r.reactions {
                    match field { 3 => d.fx *= -1.0, 4 => d.fz *= -1.0, 5 => d.my *= -1.0, _ => {} }
                }
                for d in &mut r.element_forces {
                    match field { 6 => { d.n_start *= -1.0; d.n_end *= -1.0; },
                        7 => { d.vz_start *= -1.0; d.vz_end *= -1.0; },
                        8 => { d.my_start *= -1.0; d.my_end *= -1.0; }, _ => {} }
                }
            };
            if nonlinear { pdelta_pair_with(&s, |r| perturb(&mut r.results)) } else { linear_pair_with(&s, perturb) }
        };
        check(None).unwrap().into_result().unwrap();
        for field in 0..9 {
            let result = check(Some(field)).unwrap().into_result();
            assert!(result.is_err(), "planar nonlinear={nonlinear}, field={field} did not reject the sign fault");
        }
    }
}

#[test]
fn seeded_failure_planar_modal_and_buckling() {
    let s = frame_2d(&FrameSpec::two_storey());
    modal_pair(&s, 3).unwrap().into_result().unwrap();
    let bad = modal_pair_with(&s, 3, |r| r.modes.iter_mut().for_each(|m| m.frequency *= 1000.0));
    assert!(bad.unwrap().into_result().is_err());
    buckling_pair(&s).unwrap().into_result().unwrap();
    let bad = buckling_pair_with(&s, |r| r.modes.iter_mut().for_each(|m| m.load_factor *= -1.0));
    assert!(bad.unwrap().into_result().is_err());
}
