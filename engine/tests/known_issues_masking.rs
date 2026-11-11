//! Masking tests for the containment guards of src/known_issues.rs: a term that inflates a
//! guard's reference (load scale, a stiff or strongly loaded part elsewhere, rigid motion, a
//! change of units) must not let the result it guards through.

use crate::common;
use dedaliano_engine::known_issues::{for_3d, Analysis};
use dedaliano_engine::metamorphic::transform::{transform_2d, transform_3d, Iso2, Iso3};
use dedaliano_engine::metamorphic::units::{scale_2d, scale_3d, Units};
use dedaliano_engine::types::*;
use std::collections::HashMap;

const E: f64 = 200_000.0;

fn phases(ds: &[StructuredDiagnostic]) -> Vec<&str> {
    ds.iter().filter_map(|d| d.phase.as_deref()).collect()
}

fn motions_3d() -> Vec<Iso3> {
    vec![
        Iso3::from_euler(0.3, 1.1, -0.7).translated([1e4, -3e3, 7e3]),
        Iso3::axis_permutation(5).translated([-250.0, 40.0, 1e3]),
    ]
}

fn units() -> Vec<Units> {
    vec![Units::froude(1e3, 1e-3), Units::froude(1e-3, 1e3), Units::froude(0.3048, 4.448)]
}

fn twisted_strip(quad9: bool) -> SolverInput3D {
    let (l, w, t) = (12.0, 1.1, 0.32);
    let (nx, ny, order) = if quad9 { (3, 1, 2) } else { (6, 2, 1) };
    let (rows, cols) = (order * nx + 1, order * ny + 1);
    let node = |i: usize, j: usize| 1 + i * cols + j;
    let mut input = common::make_3d_input(vec![], vec![(1, 29_000.0, 0.22)], vec![], vec![], vec![], vec![]);
    for i in 0..rows {
        for j in 0..cols {
            let x = i as f64 / (rows - 1) as f64 * l;
            let s = j as f64 / (cols - 1) as f64 * w - w / 2.0;
            let a = x / l * std::f64::consts::FRAC_PI_2;
            input.nodes.insert(node(i, j).to_string(), SolverNode3D { id: node(i, j), x, y: s * a.cos(), z: s * a.sin() });
        }
    }
    let mut id = 1;
    for i in 0..nx {
        for j in 0..ny {
            if quad9 {
                let (i, j) = (2 * i, 2 * j);
                let nodes = [node(i, j), node(i + 2, j), node(i + 2, j + 2), node(i, j + 2), node(i + 1, j), node(i + 2, j + 1), node(i + 1, j + 2), node(i, j + 1), node(i + 1, j + 1)];
                input.quad9s.insert(id.to_string(), SolverQuad9Element { id, nodes, material_id: 1, thickness: t });
            } else {
                input.quads.insert(id.to_string(), SolverQuadElement { id, nodes: [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)], material_id: 1, thickness: t });
            }
            id += 1;
        }
    }
    for j in 0..cols {
        input.supports.insert(j.to_string(), serde_json::from_value(serde_json::json!({"nodeId": node(0, j), "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true})).unwrap());
    }
    input.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: node(rows - 1, cols / 2), fx: 0.0, fy: 0.0, fz: 1.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
    input
}

#[test]
fn warped_shells_are_withheld_after_any_rigid_motion_or_change_of_units_1057() {
    for (quad9, id) in [(false, "SH-WARPED-MITC4"), (true, "SH-WARPED-MITC9")] {
        let base = twisted_strip(quad9);
        let elements = if quad9 { 3 } else { 12 };
        let mut variants: Vec<(String, SolverInput3D)> = vec![("as given".into(), base.clone())];
        variants.extend(motions_3d().iter().map(|iso| (format!("{:?}", iso.t), transform_3d(&base, iso).unwrap())));
        variants.extend(units().iter().map(|u| (format!("units {} {}", u.length, u.force), scale_3d(&base, u))));
        for (name, input) in variants {
            let found: Vec<_> = for_3d(&input, Analysis::Linear).into_iter().filter(|d| d.phase.as_deref() == Some(id)).collect();
            assert_eq!(found.len(), 1, "{id} {name}");
            assert_eq!(found[0].severity, Severity::Error, "{id} {name}");
            assert_eq!(found[0].element_ids, (1..=elements).collect::<Vec<_>>(), "{id} {name}");
            common::assert_containment(dedaliano_engine::solver::linear::solve_3d(&input), id);
        }
    }
}

fn soft_cantilever(load: f64, stiff_part: bool) -> SolverInput3D {
    let mut nodes = vec![(1, 0.0, 0.0, 0.0), (2, 1.0, 0.0, 0.0)];
    let mut elements = vec![(1, "frame", 1, 2, 1, 1)];
    let mut supports = vec![(1, vec![true; 6])];
    let mut loads = vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 0.0, fy: 0.0, fz: -load, mx: 0.0, my: 0.0, mz: 0.0, bw: None })];
    if stiff_part {
        nodes.extend([(3, 0.0, 5.0, 0.0), (4, 2.0, 5.0, 0.0)]);
        elements.push((2, "frame", 3, 4, 1, 2));
        supports.push((3, vec![true; 6]));
        loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 4, fx: 0.0, fy: 1e6, fz: -1e6, mx: 1e5, my: 0.0, mz: 0.0, bw: None }));
    }
    common::make_3d_input(nodes, vec![(1, E, 0.3)], vec![(1, 0.01, 1e-10, 1e3, 1e3), (2, 10.0, 1e5, 1e5, 1e5)], elements, supports, loads)
}

#[test]
fn a_soft_rotation_is_solved_exactly_or_refused_whatever_masks_its_scale_1496() {
    let exact = |load: f64| load / (2.0 * E * 1000.0 * 1e-10);
    let mut cases: Vec<(String, SolverInput3D, f64)> = Vec::new();
    for load in [1e-3, 1e-12, 1e6] {
        for stiff_part in [false, true] {
            cases.push((format!("load {load:e}, stiff part {stiff_part}"), soft_cantilever(load, stiff_part), exact(load)));
        }
    }
    for u in units() {
        cases.push((format!("units {} {}", u.length, u.force), scale_3d(&soft_cantilever(1e-3, true), &u), exact(1e-3)));
    }
    for iso in motions_3d() {
        cases.push((format!("moved {:?}", iso.t), transform_3d(&soft_cantilever(1e-3, true), &iso).unwrap(), exact(1e-3)));
    }
    let mut outcomes = Vec::new();
    for (name, input, theta) in cases {
        let verdict = dedaliano_engine::solver::stability::of_3d(&input).unwrap();
        let r = match dedaliano_engine::solver::linear::solve_3d(&input) {
            Ok(r) => r,
            Err(e) => {
                assert!(e.starts_with("the structure is a mechanism") || e.starts_with("the structure cannot be solved reliably"), "{name}: {e}");
                assert!(verdict.refusal().is_some(), "{name}: {verdict:?}");
                outcomes.push(false);
                continue;
            }
        };
        assert!(verdict.is_stable(), "{name}: {verdict:?}");
        let tip = r.displacements.iter().find(|d| d.node_id == 2).unwrap();
        let got = (tip.rx * tip.rx + tip.ry * tip.ry + tip.rz * tip.rz).sqrt();
        assert!((got - theta).abs() <= 1e-6 * theta, "{name}: θ {got} instead of {theta}: {:?}", phases(&r.structured_diagnostics));
        outcomes.push(true);
    }
    assert!(outcomes[..6 + units().len()].iter().all(|&solved| solved), "the independent axis-aligned directions must solve at every load and unit scale: {outcomes:?}");
}

fn bathe_bolourchi() -> SolverInput3D {
    let (r, n) = (100.0f64, 8);
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    for i in 0..=n {
        let a = std::f64::consts::FRAC_PI_4 * i as f64 / n as f64;
        nodes.insert((i + 1).to_string(), serde_json::json!({"id": i + 1, "x": r * a.sin(), "y": r * (1.0 - a.cos()), "z": 0.0}));
        if i > 0 {
            elements.insert(i.to_string(), serde_json::json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 1, "sectionId": 1}));
        }
    }
    serde_json::from_value(serde_json::json!({
        "nodes": nodes, "elements": elements,
        "materials": {"1": {"id": 1, "e": 1.0e4, "nu": 0.0}},
        "sections": {"1": {"id": 1, "a": 1.0, "iy": 1.0 / 12.0, "iz": 1.0 / 12.0, "j": 1.0 / 6.0}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": [{"type": "nodal", "data": {"nodeId": n + 1, "fx": 0, "fy": 0, "fz": 600.0, "mx": 0, "my": 0, "mz": 0}}]
    })).unwrap()
}

#[test]
fn the_corotational_natural_rotation_warning_survives_rigid_motion_and_units_426() {
    let base = bathe_bolourchi();
    let mut variants: Vec<(String, SolverInput3D)> = vec![("as given".into(), base.clone())];
    variants.extend(motions_3d().iter().map(|iso| (format!("{:?}", iso.t), transform_3d(&base, iso).unwrap())));
    variants.extend(units().iter().map(|u| (format!("units {} {}", u.length, u.force), scale_3d(&base, u))));
    for (name, input) in variants {
        let r = dedaliano_engine::solver::corotational::solve_corotational_3d(&input, 100, 1e-8, 60, false).unwrap();
        assert!(r.converged, "{name}");
        assert!(phases(&r.results.structured_diagnostics).contains(&"NL-3"), "{name}: {:?}", phases(&r.results.structured_diagnostics));
    }
}

fn issue_982() -> SolverInput {
    serde_json::from_str(include_str!("metamorphic_corpus/nightly/issue-982.json")).unwrap()
}

#[test]
fn no_buckling_mode_driven_by_round_off_survives_load_scaling_units_or_translation_982() {
    let base = issue_982();
    let rotated = transform_2d(&base, &Iso2::rotation(1f64.to_radians())).unwrap();
    let reference = dedaliano_engine::solver::buckling::solve_buckling_2d(&rotated, 3).unwrap();
    let expected: Vec<f64> = reference.modes.iter().map(|m| m.load_factor).collect();
    assert_eq!(expected.len(), 2, "{expected:?}");
    let mut variants: Vec<(String, SolverInput, f64)> = Vec::new();
    for scale in [1e-6, 1e6] {
        let mut input = rotated.clone();
        for load in &mut input.loads {
            if let SolverLoad::Distributed(q) = load { q.q_i *= scale; q.q_j *= scale; }
        }
        variants.push((format!("load ×{scale:e}"), input, scale));
    }
    variants.extend(units().iter().map(|u| (format!("units {} {}", u.length, u.force), scale_2d(&rotated, u), 1.0)));
    variants.push(("moved far".into(), transform_2d(&base, &Iso2::rotation(1f64.to_radians()).translated(1e4, -3e3)).unwrap(), 1.0));
    for (name, input, load_scale) in variants {
        let b = dedaliano_engine::solver::buckling::solve_buckling_2d(&input, 3).unwrap_or_else(|e| panic!("{name}: {e}"));
        let actual: Vec<f64> = b.modes.iter().map(|m| m.load_factor * load_scale).collect();
        assert_eq!(actual.len(), expected.len(), "{name}: {actual:?}");
        for (a, e) in actual.iter().zip(&expected) {
            assert!((a / e - 1.0).abs() < 1e-6, "{name}: {actual:?} vs {expected:?}");
        }
        assert!(!b.structured_diagnostics.iter().any(|d| d.phase.as_deref() == Some("BU-UNRESOLVED-MODE")), "{name}: {:?}", b.structured_diagnostics);
    }
}

fn harmonic_beam(frequencies: Vec<f64>, load: f64, u: Option<&Units>) -> dedaliano_engine::solver::harmonic::HarmonicResult {
    let n = 24;
    let nodes = (0..=n).map(|i| (i + 1, i as f64 * 10.0 / n as f64, 0.0)).collect();
    let elems = (0..n).map(|i| (i + 1, "frame", i + 1, i + 2, 1, 1, false, false)).collect();
    let mut solver = common::make_input(nodes, vec![(1, E, 0.3)], vec![(1, 0.05, 1e-4)], elems, vec![(1, 1, "pinned"), (2, n + 1, "rollerX")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: -load, my: 0.0 })]);
    let mut densities = HashMap::from([("1".to_string(), 7850.0)]);
    let mut frequencies = frequencies;
    if let Some(u) = u {
        solver = scale_2d(&solver, u);
        densities = dedaliano_engine::metamorphic::units::scale_densities(&densities, u);
        frequencies.iter_mut().for_each(|f| *f *= u.frequency());
    }
    let input = dedaliano_engine::solver::harmonic::HarmonicInput {
        solver, densities, frequencies, damping_ratio: 0.05, response_node_id: 4, response_dof: "y".into(),
    };
    dedaliano_engine::solver::harmonic::solve_harmonic_2d(&input).unwrap()
}

#[test]
fn harmonic_above_the_kept_modes_is_solved_directly_at_any_load_scale_or_units_1434() {
    let high: Vec<f64> = std::iter::once(0.5).chain((1..=40).map(|i| i as f64 * 250.0)).collect();
    let mut cases: Vec<(String, dedaliano_engine::solver::harmonic::HarmonicResult)> = Vec::new();
    for load in [10.0, 1e-9, 1e9] {
        cases.push((format!("load {load:e}"), harmonic_beam(high.clone(), load, None)));
    }
    for u in units() {
        cases.push((format!("units {} {}", u.length, u.force), harmonic_beam(high.clone(), 10.0, Some(&u))));
    }
    let direct_at = |r: &dedaliano_engine::solver::harmonic::HarmonicResult| -> Vec<usize> {
        r.response_points.iter().enumerate().filter(|(_, p)| r.direct_frequencies.contains(&p.frequency)).map(|(i, _)| i).collect()
    };
    let expected = direct_at(&cases[0].1);
    assert!(!expected.is_empty() && expected.len() < high.len(), "{expected:?}");
    for (name, r) in &cases {
        assert!(r.modes_used < r.n_dof, "{name}: {} of {}", r.modes_used, r.n_dof);
        assert_eq!(direct_at(r), expected, "{name}");
        assert!(!phases(&r.structured_diagnostics).contains(&"HARM-TRUNCATION"), "{name}: {:?}", phases(&r.structured_diagnostics));
    }
}
