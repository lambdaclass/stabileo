//! Minimal reproductions of the violations the metamorphic harness found,
//! one per bug, each stated as the physics it must obey
//! (docs/verification/METAMORPHIC.md, "Violations found").

use crate::case::Case2;
use dedaliano_engine::solver::plastic_limit::limit_analysis_2d_input;
use dedaliano_engine::metamorphic::transform::{transform_2d, Iso2, Iso3};
use dedaliano_engine::postprocess::influence;
use dedaliano_engine::solver::{constraints, corotational, kinematic, linear, load_cases, moving_loads, plastic, spectral, staged, winkler};
use dedaliano_engine::types::*;
use serde_json::json;

fn s2(v: serde_json::Value) -> SolverInput {
    serde_json::from_value(v).unwrap()
}

fn close(a: f64, b: f64, rel: f64, what: &str) {
    assert!((a - b).abs() <= rel * a.abs().max(b.abs()).max(1e-300), "{what}: {a} vs {b}");
}

fn disp(r: &AnalysisResults, n: usize) -> &Displacement {
    r.displacements.iter().find(|d| d.node_id == n).unwrap()
}

/// Cantilever 1–2 (fixed at 1), hinged at 2, with a moment at 2.
fn hinged_tip() -> SolverInput {
    s2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "z": 0.0}, "3": {"id": 3, "x": 3.0, "z": 2.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": true},
            "2": {"id": 2, "type": "frame", "nodeI": 1, "nodeJ": 3, "materialId": 1, "sectionId": 1}
        },
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": 0.0, "my": 10.0}}]
    }))
}

/// A nodal moment on a rotation nothing stiffens is refused on every path
/// (the constrained path returned a rotation of ~1e5 rad).
#[test]
fn moment_on_unstiffened_rotation_refused_on_every_path() {
    let s = hinged_tip();
    assert!(linear::solve_2d(&s).is_err());
    let mut c = s.clone();
    c.constraints = vec![serde_json::from_value(json!({"type": "equalDOF", "masterNode": 3, "slaveNode": 2, "dofs": [0]})).unwrap()];
    let r = linear::solve_2d(&c);
    assert!(r.as_ref().is_err_and(|e| e.contains("node 2")), "{:?}", r.map(|r| disp(&r, 2).ry));
    let r = constraints::solve_constrained_2d(&constraints::ConstrainedInput { solver: c.clone(), constraints: c.constraints.clone() });
    assert!(r.is_err());
}

/// The prepared (factor-once) path has no constraint reduction and refuses a
/// constrained model instead of solving it without its constraints.
#[test]
fn prepared_static_refuses_constraints() {
    let mut s = hinged_tip();
    s.loads.clear();
    s.constraints = vec![serde_json::from_value(json!({"type": "equalDOF", "masterNode": 3, "slaveNode": 2, "dofs": [0, 1]})).unwrap()];
    assert!(linear::prepare_static_2d(&s).is_err());
    assert!(linear::prepare_static_2d_dense_reference(&s).is_err());
}

/// Two-span beam with a settlement at the middle roller.
fn settlement_beam() -> SolverInput {
    s2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 4.0, "z": 0.0}, "3": {"id": 3, "x": 8.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1}
        },
        "supports": {
            "1": {"id": 1, "nodeId": 1, "type": "fixed"},
            "2": {"id": 2, "nodeId": 2, "type": "rollerX", "dz": -0.01},
            "3": {"id": 3, "nodeId": 3, "type": "rollerX"}
        },
        "loads": [{"type": "distributed", "data": {"elementId": 1, "qI": -5.0, "qJ": -5.0}}]
    }))
}

/// A settlement on a roller rotated into an inclined support moves the
/// structure the same way in Winkler and material-nonlinear analyses as in
/// the linear solver (they assigned the raw global dz to the normal DOF).
#[test]
fn settlement_on_inclined_support_in_winkler_and_material_nonlinear() {
    let iso = Iso2::rotation(0.5);
    let s = transform_2d(&settlement_beam(), &iso).unwrap();
    assert!(s.supports.values().any(|x| x.support_type == "inclinedRoller"));
    let lin = linear::solve_2d(&s).unwrap();
    let w = winkler::solve_winkler_2d(&winkler::WinklerInput { solver: s.clone(), foundation_springs: vec![] }).unwrap();
    let inp = NonlinearMaterialInput {
        solver: s.clone(),
        material_models: [("1".to_string(), MaterialModel { model_type: "elastic_perfectly_plastic".into(), fy: 1e9, alpha: None })].into(),
        section_capacities: [("1".to_string(), SectionCapacity { np: 1e12, mp: 1e12, zp: None })].into(),
        max_iter: 50,
        tolerance: 1e-10,
        n_increments: 1,
    };
    let m = dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_2d(&inp).unwrap();
    for n in [2, 3] {
        for (got, name) in [(disp(&w, n), "Winkler"), (disp(&m.results, n), "material nonlinear")] {
            // On the 0.01 m settlement's scale.
            assert!((got.ux - disp(&lin, n).ux).abs() < 1e-9 && (got.uz - disp(&lin, n).uz).abs() < 1e-9, "{name} at node {n}");
        }
    }
}

/// Influence ordinates are unit-load responses: a support settlement in the
/// model does not shift them.
#[test]
fn influence_line_ignores_settlements() {
    let with = settlement_beam();
    let mut without = with.clone();
    for s in without.supports.values_mut() {
        s.dz = None;
    }
    let il = |s: &SolverInput| {
        influence::compute_influence_line(&influence::InfluenceLineInput {
            solver: s.clone(), quantity: "M".into(), target_node_id: None, target_element_id: Some(1), target_position: 0.5, n_points_per_element: 4,
        })
        .unwrap()
        .points
        .iter()
        .map(|p| p.value)
        .collect::<Vec<_>>()
    };
    let (a, b) = (il(&with), il(&without));
    for (x, y) in a.iter().zip(&b) {
        close(*x, *y, 1e-9, "influence ordinate");
    }
}

/// A deck member drawn right-to-left carries the train downwards, at the
/// right place: the envelope is that of the same deck drawn left-to-right
/// (the near-horizontal branch pushed the train up, and positions were
/// measured from the wrong end).
#[test]
fn moving_load_on_member_drawn_against_travel() {
    let mut s = settlement_beam();
    for sp in s.supports.values_mut() {
        sp.dz = None;
    }
    s.loads.clear();
    let mut rev = s.clone();
    let e = rev.elements.get_mut("2").unwrap();
    std::mem::swap(&mut e.node_i, &mut e.node_j);
    let run = |s: &SolverInput| {
        moving_loads::solve_moving_loads_2d(&MovingLoadInput {
            solver: s.clone(),
            train: LoadTrain { name: "t".into(), axles: vec![Axle { offset: 0.0, weight: 50.0 }, Axle { offset: 1.5, weight: 25.0 }] },
            step: Some(0.25),
            path_element_ids: Some(vec![1, 2]),
        })
        .unwrap()
    };
    let (a, b) = (run(&s), run(&rev));
    let (ea, eb) = (&a.elements["1"], &b.elements["1"]);
    close(ea.m_max_pos, eb.m_max_pos, 1e-9, "M+ on the forward member");
    close(ea.m_max_neg, eb.m_max_neg, 1e-9, "M- on the forward member");
    let (ea, eb) = (&a.elements["2"], &b.elements["2"]);
    // Reversed member: end moments map (mS, mE) → (−mE, −mS).
    close(ea.m_max_pos, -eb.m_max_neg, 1e-9, "M+ on the reversed member");
    close(ea.m_max_neg, -eb.m_max_pos, 1e-9, "M- on the reversed member");
}

/// rollerZ and guidedZ (aliases of rollerY and guidedY) count their
/// restraints in the kinematic degree.
#[test]
fn kinematic_counts_z_aliases() {
    let mut a = settlement_beam();
    a.supports.get_mut("3").unwrap().support_type = "rollerY".into();
    a.supports.get_mut("2").unwrap().support_type = "guidedY".into();
    a.supports.get_mut("2").unwrap().dz = None;
    let mut b = a.clone();
    b.supports.get_mut("3").unwrap().support_type = "rollerZ".into();
    b.supports.get_mut("2").unwrap().support_type = "guidedZ".into();
    assert_eq!(kinematic::analyze_kinematics_2d(&a).degree, kinematic::analyze_kinematics_2d(&b).degree);
}

/// The co-rotational element of a member drawn along −X: a cantilever
/// pointing left deflects as the mirror image of one pointing right (the
/// chord angle jumped by 2π across atan2's cut).
#[test]
fn corotational_member_along_negative_x() {
    let right = s2(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 2.0, "z": 0.0}, "3": {"id": 3, "x": 4.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-5}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1}
        },
        "supports": {"1": {"id": 1, "nodeId": 1, "type": "fixed"}},
        "loads": [{"type": "nodal", "data": {"nodeId": 3, "fx": 0.0, "fz": -20.0, "my": 0.0}}]
    }));
    let left = transform_2d(&right, &Iso2::mirror_x()).unwrap();
    let a = corotational::solve_corotational_2d(&right, 100, 1e-10, 4, false).unwrap();
    let b = corotational::solve_corotational_2d(&left, 100, 1e-10, 4, false).unwrap();
    assert!(a.converged && b.converged);
    close(disp(&b.results, 3).ux, -disp(&a.results, 3).ux, 1e-6, "ux");
    close(disp(&b.results, 3).uz, disp(&a.results, 3).uz, 1e-6, "uz");
}

/// The co-rotational solve converges for a model far from the origin (the
/// chord was a difference of absolute deformed positions).
#[test]
fn corotational_far_from_origin() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ex-3d-building-case3-input.json")).unwrap();
    let s: SolverInput3D = serde_json::from_str(&text).unwrap();
    let far = dedaliano_engine::metamorphic::transform::transform_3d(&s, &Iso3::axis_permutation(0).translated([4.0e3, -4.0e3, 4.0e2])).unwrap();
    let a = corotational::solve_corotational_3d(&s, 100, 1e-10, 4, false).unwrap();
    let b = corotational::solve_corotational_3d(&far, 100, 1e-10, 4, false).unwrap();
    assert!(a.converged && b.converged, "far-away building did not converge");
    close(a.max_displacement, b.max_displacement, 1e-7, "max displacement");
}

/// A combination 1·A + 1·B equals the single solve of A + B: the model's
/// settlement enters once, not once per case.
#[test]
fn combination_counts_settlement_once() {
    let mut s = settlement_beam();
    s.loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 1.0, fz: -3.0, my: 0.0 }));
    let lin = linear::solve_2d(&s).unwrap();
    let mut base = s.clone();
    let loads = std::mem::take(&mut base.loads);
    let inp = load_cases::MultiCaseInput {
        solver: base,
        load_cases: vec![
            load_cases::LoadCase { name: "A".into(), loads: vec![loads[0].clone()] },
            load_cases::LoadCase { name: "B".into(), loads: vec![loads[1].clone()] },
        ],
        combinations: vec![load_cases::CombinationDef { name: "C".into(), factors: [("A".to_string(), 1.0), ("B".to_string(), 1.0)].into() }],
    };
    let r = load_cases::solve_multi_case_2d(&inp).unwrap();
    for n in [2, 3] {
        close(disp(&r.combination_results[0].results, n).uz, disp(&lin, n).uz, 1e-9, "combined uz");
        close(disp(&r.combination_results[0].results, n).ry, disp(&lin, n).ry, 1e-9, "combined ry");
    }
}

/// A staged model whose loads arrive in two stages, every member and support
/// present from the first, ends where the linear solve does: the settlement
/// is applied once, not once per stage.
#[test]
fn staged_counts_settlement_once() {
    let mut s = settlement_beam();
    s.loads.push(SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -3.0, my: 0.0 }));
    let lin = linear::solve_2d(&s).unwrap();
    let st = |name: &str, loads: Vec<usize>, all: bool| ConstructionStage {
        name: name.into(),
        elements_added: if all { vec![1, 2] } else { vec![] },
        elements_removed: vec![],
        load_indices: loads,
        supports_added: if all { vec![1, 2, 3] } else { vec![] },
        supports_removed: vec![],
        prestress_loads: vec![],
    };
    let inp = StagedInput {
        nodes: s.nodes.clone(), materials: s.materials.clone(), sections: s.sections.clone(), elements: s.elements.clone(),
        supports: s.supports.clone(), loads: s.loads.clone(), constraints: vec![], stages: vec![st("1", vec![0], true), st("2", vec![1], false)],
    };
    let r = staged::solve_staged_2d(&inp).unwrap();
    for n in [2, 3] {
        close(disp(&r.final_results, n).uz, disp(&lin, n).uz, 1e-9, "staged uz");
    }
}

fn cantilever_3d(left_hand: bool) -> SolverInput3D {
    serde_json::from_value(json!({
        "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 3.0, "y": 0.0, "z": 0.0}},
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 2e-4, "iz": 1e-4, "j": 5e-5}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": [{"type": "distributed", "data": {"elementId": 1, "qYI": 2.0, "qYJ": 2.0, "qZI": -4.0, "qZJ": -1.0}}],
        "leftHand": left_hand
    }))
    .unwrap()
}

fn staged_one_stage_3d(s: &SolverInput3D) -> AnalysisResults3D {
    let v = json!({
        "nodes": s.nodes, "materials": s.materials, "sections": s.sections, "elements": s.elements,
        "supports": s.supports, "loads": s.loads, "leftHand": s.left_hand,
        "stages": [{"name": "all", "elementsAdded": [1], "loadIndices": [0], "supportsAdded": [1]}]
    });
    staged::solve_staged_3d(&staged::parse_staged_3d(&v.to_string()).unwrap()).unwrap().final_results
}

/// A one-stage 3D staged analysis reports what the linear solver does:
/// member end forces with fixed-end forces and the engine's sign convention,
/// reactions; both refuse left-handed axes.
#[test]
fn staged_3d_matches_linear() {
    for lh in [false, true] {
        let s = cantilever_3d(lh);
        if lh {
            // Left-handed axes are refused (they would change the element
            // stiffness), by both paths alike.
            assert!(linear::solve_3d(&s).unwrap_err().contains("leftHand"));
            let v = json!({
                "nodes": s.nodes, "materials": s.materials, "sections": s.sections, "elements": s.elements,
                "supports": s.supports, "loads": s.loads, "leftHand": true,
                "stages": [{"name": "all", "elementsAdded": [1], "loadIndices": [0], "supportsAdded": [1]}]
            });
            let refused = staged::parse_staged_3d(&v.to_string()).and_then(|i| staged::solve_staged_3d(&i).map(|_| ()));
            assert!(refused.unwrap_err().contains("leftHand"));
            continue;
        }
        let lin = linear::solve_3d(&s).unwrap();
        let st = staged_one_stage_3d(&s);
        let (a, b) = (&lin.element_forces[0], &st.element_forces[0]);
        for (x, y, n) in [
            (a.n_start, b.n_start, "N"), (a.vy_start, b.vy_start, "Vy"), (a.vz_end, b.vz_end, "Vz"),
            (a.my_start, b.my_start, "My"), (a.mz_start, b.mz_start, "Mz"), (a.mz_end, b.mz_end, "Mz end"),
        ] {
            close(y, x, 1e-9, &format!("{n} (leftHand {lh})"));
        }
        let (ra, rb) = (&lin.reactions[0], &st.reactions[0]);
        close(rb.fy, ra.fy, 1e-9, "Fy");
        close(rb.fz, ra.fz, 1e-9, "Fz");
        close(rb.my, ra.my, 1e-9, "My");
        close(rb.mz, ra.mz, 1e-9, "Mz");
    }
}

/// CQC base shear is basis-independent: relabelling a model with repeated
/// frequencies (a square grid slab) does not change it (it was the SRSS of
/// the modal base shears whatever the rule).
#[test]
fn spectral_cqc_base_shear_independent_of_mode_basis() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ex-3d-grid-slab-input.json")).unwrap();
    let s: SolverInput3D = serde_json::from_str(&text).unwrap();
    let c = crate::case::Case3::new("g", s);
    let rl = dedaliano_engine::metamorphic::relabel::Relabel::random_3d(&c.s, 11);
    let shear = |c: &crate::case::Case3| {
        let md = dedaliano_engine::solver::modal::solve_modal_3d(&c.s, &c.dens, 6).unwrap();
        let modes = md
            .modes
            .iter()
            .map(|x| SpectralModeInput3D {
                frequency: x.frequency, period: x.period, omega: x.omega,
                displacements: x.displacements.iter().map(|d| SpectralModeDisp3D { node_id: d.node_id, ux: d.ux, uy: d.uy, uz: d.uz, rx: d.rx, ry: d.ry, rz: d.rz }).collect(),
                participation_x: x.participation_x, participation_y: x.participation_y, participation_z: x.participation_z,
                effective_mass_x: x.effective_mass_x, effective_mass_y: x.effective_mass_y, effective_mass_z: x.effective_mass_z,
            })
            .collect();
        spectral::solve_spectral_3d(&SpectralInput3D {
            solver: c.s.clone(), modes, densities: c.dens.clone(),
            spectrum: DesignSpectrum { name: "flat".into(), points: vec![SpectrumPoint { period: 0.0, sa: 0.3 }, SpectrumPoint { period: 10.0, sa: 0.3 }], in_g: Some(true) },
            direction: "X".into(), rule: Some("CQC".into()), xi: Some(0.05), importance_factor: None, reduction_factor: None, total_mass: None,
        })
        .unwrap()
        .base_shear
    };
    close(shear(&c.relabel(&rl, 11)), shear(&c), 1e-7, "base shear");
}

#[test]
#[ignore]
fn probe_units_3d() {
    use dedaliano_engine::metamorphic::units::{scale_3d, Units};
    // A debugging probe (PFILE=<model.json>); `--ignored` runs it too.
    let Ok(f) = std::env::var("PFILE") else { return eprintln!("PFILE not set: probe skipped") };
    let s: SolverInput3D = serde_json::from_str(&std::fs::read_to_string(&f).unwrap()).unwrap();
    let base = linear::solve_3d(&s).unwrap();
    let pick = |r: &AnalysisResults3D| r.displacements.iter().map(|d| (d.node_id, d.ux, d.uz, d.ry)).collect::<Vec<_>>();
    println!("base {:?}", pick(&base));
    for (l, fo) in [(1e-3, 1e3), (25.0, 1e-2), (0.3048, 4.448), (1.0, 7.0), (2.0, 1.0)] {
        let u = Units::froude(l, fo);
        let r = linear::solve_3d(&scale_3d(&s, &u)).unwrap();
        let v: Vec<_> = pick(&r).iter().map(|&(n, a, b, c)| (n, a / l, b / l, c)).collect();
        println!("{l} {fo}: {:?}", v);
    }
}

#[test]
#[ignore]
fn probe_krx() {
    let f = "tests/metamorphic_corpus/feature_matrix/3d-spring-support--rotational--spring-restrained-beam-with.json";
    let s: SolverInput3D = serde_json::from_str(&std::fs::read_to_string(f).unwrap()).unwrap();
    for k in 0..4 {
        let iso = Iso3::about_z(std::f64::consts::FRAC_PI_2 * k as f64);
        let t = dedaliano_engine::metamorphic::transform::transform_3d(&s, &iso).unwrap();
        let sup = t.supports.values().find(|x| x.node_id == 1).unwrap();
        println!("k={k} flags {:?} springs {:?} -> {:?}", (sup.rrx, sup.rry, sup.rrz), (sup.krx, sup.kry, sup.krz), linear::solve_3d(&t).map(|r| r.displacements.len()).map_err(|e| e.chars().take(80).collect::<String>()));
    }
}

/// Shell rotary inertia acts about the shell's in-plane axes: a cantilever
/// strip of MITC4 shells has the same frequencies lying flat and standing as
/// a wall (it was put on global rx, ry whatever the orientation).
#[test]
fn shell_rotary_inertia_follows_the_shell() {
    let f = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/metamorphic_corpus/feature_matrix/3d-quad-shell--mitc4--strip-cantilever------0-with.json");
    let s: SolverInput3D = serde_json::from_str(&std::fs::read_to_string(f).unwrap()).unwrap();
    let c = crate::case::Case3::new("strip", s);
    for k in [3, 7, 13] {
        let iso = Iso3::axis_permutation(k);
        let t = c.iso(&iso).unwrap();
        let a = dedaliano_engine::solver::modal::solve_modal_3d(&c.s, &c.dens, 6).unwrap();
        let b = dedaliano_engine::solver::modal::solve_modal_3d(&t.s, &t.dens, 6).unwrap();
        for (x, y) in a.modes.iter().zip(&b.modes) {
            close(y.frequency, x.frequency, 1e-7, "frequency");
        }
    }
}

/// The plastic-collapse input of a 3D case, as the "plastic collapse" analysis
/// of the harness builds it (rectangles from A, I_y, I_z; f_y of the case).
fn plastic_3d_input(c: &crate::case::Case3) -> PlasticInput3D {
    let rect3 = |s: &SolverSection3D| ((12.0 * s.iy / s.a).sqrt(), (12.0 * s.iz / s.a).sqrt());
    let sections = c
        .s
        .sections
        .values()
        .map(|x| {
            let (b, h) = rect3(x);
            let mat = c.s.elements.values().find(|e| e.section_id == x.id).map_or(1, |e| e.material_id);
            (x.id.to_string(), PlasticSectionData3D { a: x.a, iy: x.iy, iz: x.iz, material_id: mat, b: Some(b), h: Some(h), d: Some(b) })
        })
        .collect();
    let materials = c.s.materials.values().map(|x| (x.id.to_string(), PlasticMaterialData { fy: Some(c.p.fy) })).collect();
    PlasticInput3D { solver: c.s.clone(), sections, materials, max_hinges: None, mp_overrides: None }
}

fn corpus_3d(name: &str) -> crate::case::Case3 {
    let f = format!("{}/tests/metamorphic_corpus/differential/{name}.json", env!("CARGO_MANIFEST_DIR"));
    crate::case::Case3::new(name, serde_json::from_str(&std::fs::read_to_string(&f).unwrap()).unwrap())
}

/// The same structure for the certificate (`certify::plastic_3d`), which
/// needs rational local axes: a roll angle becomes the local-y vector it
/// gives, and a point load on a member becomes a nodal load at a node
/// splitting the member there. Settlements are dropped: imposed deformations
/// do not change a collapse load.
fn certifiable(inp: &PlasticInput3D) -> PlasticInput3D {
    let mut inp = inp.clone();
    let s = &mut inp.solver;
    for sup in s.supports.values_mut() {
        (sup.dx, sup.dy, sup.dz, sup.drx, sup.dry, sup.drz) = (None, None, None, None, None, None);
    }
    let lh = s.left_hand.unwrap_or(false);
    let node = |s: &SolverInput3D, id: usize| s.nodes.values().find(|n| n.id == id).unwrap().clone();
    let keys: Vec<String> = s.elements.keys().cloned().collect();
    for k in keys {
        let e = s.elements[&k].clone();
        if e.roll_angle.is_some() {
            let (a, b) = (node(s, e.node_i), node(s, e.node_j));
            let (_, ey, _) = dedaliano_engine::element::compute_local_axes_3d(a.x, a.y, a.z, b.x, b.y, b.z, e.local_yx, e.local_yy, e.local_yz, e.roll_angle, lh);
            let el = s.elements.get_mut(&k).unwrap();
            (el.local_yx, el.local_yy, el.local_yz, el.roll_angle) = (Some(ey[0]), Some(ey[1]), Some(ey[2]), None);
        }
    }
    let mut next_n = s.nodes.values().map(|n| n.id).max().unwrap() + 1;
    let mut next_e = s.elements.values().map(|e| e.id).max().unwrap() + 1;
    for ld in std::mem::take(&mut s.loads) {
        let SolverLoad3D::PointOnElement(pl) = &ld else {
            s.loads.push(ld);
            continue;
        };
        let k = s.elements.iter().find(|(_, e)| e.id == pl.element_id).unwrap().0.clone();
        let e = s.elements[&k].clone();
        let (a, b) = (node(s, e.node_i), node(s, e.node_j));
        let t = pl.a / ((b.x - a.x).powi(2) + (b.y - a.y).powi(2) + (b.z - a.z).powi(2)).sqrt();
        let (_, ey, ez) = dedaliano_engine::element::compute_local_axes_3d(a.x, a.y, a.z, b.x, b.y, b.z, e.local_yx, e.local_yy, e.local_yz, e.roll_angle, lh);
        let (nid, eid) = (next_n, next_e);
        (next_n, next_e) = (next_n + 1, next_e + 1);
        s.nodes.insert(nid.to_string(), SolverNode3D { id: nid, x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), z: a.z + t * (b.z - a.z) });
        s.elements.insert(eid.to_string(), SolverElement3D { id: eid, node_i: nid, ..e.clone() });
        s.elements.get_mut(&k).unwrap().node_j = nid;
        let f: Vec<f64> = (0..3).map(|k| pl.py * ey[k] + pl.pz * ez[k]).collect();
        s.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: nid, fx: f[0], fy: f[1], fz: f[2], mx: 0.0, my: 0.0, mz: 0.0, bw: None }));
    }
    inp
}

/// #511: a 3D plastic collapse factor is a property of the structure, not of
/// how its members are numbered. The metamorphic relabel check found the
/// differential frame3d-2 reporting 75.87, 101.7, 145.9, 241.1 or 424.3 for
/// the same structure (its certified collapse factor is 176.47): the
/// reversal checks of biaxial hinges cycled, the solver went on from
/// whichever state of the cycle the element order left it in, and drove a
/// closed section through the yield surface. Every renumbering must now give
/// the same factor, and it must be a lower bound unless the result says it
/// is approximate.
#[test]
fn plastic_3d_collapse_factor_does_not_depend_on_numbering() {
    use dedaliano_engine::metamorphic::relabel::Relabel;
    // the certified collapse factor of each model (`certify_plastic_3d` on
    // `certifiable`), where the certificate applies
    let cases: [(&str, Option<f64>); 6] = [
        ("frame3d-2", Some(176.467325809)),
        ("frame3d-0", None),
        ("frame3d-4", None),
        ("pdelta3d-1", Some(15.7479054153)),
        ("building-1", None),
        ("pdelta3d-3", None),
    ];
    for (name, certified) in cases {
        let c = corpus_3d(name);
        let base = plastic::solve_plastic_3d(&plastic_3d_input(&c)).unwrap();
        for seed in 0..16 {
            let rl = Relabel::random_3d(&c.s, seed);
            let r = plastic::solve_plastic_3d(&plastic_3d_input(&c.relabel(&rl, seed))).unwrap();
            close(r.collapse_factor, base.collapse_factor, 1e-7, &format!("{name} renumbered (seed {seed})"));
            assert_eq!(r.is_mechanism, base.is_mechanism, "{name} seed {seed}");
        }
        if let Some(lc) = certified {
            // above the collapse load only with the solver saying so
            let flagged = base.warnings.iter().any(|w| w.contains("approximate") || w.contains("not guaranteed"));
            assert!(base.collapse_factor <= lc * (1.0 + 1e-9) || flagged, "{name}: {} above λ_c = {lc}: {:?}", base.collapse_factor, base.warnings);
            assert!(base.collapse_factor <= lc * 1.005, "{name}: {} vs λ_c = {lc}", base.collapse_factor);
        }
    }
}

/// frame3d-2 against its certificate: the solver stops where no consistent
/// set of active hinges exists (λ = 73.71), says so, and that is a lower
/// bound of the certified collapse factor 176.47 (static theorem; the
/// field there is admissible). It used to go on to 75.87 with a moment field
/// 1.40 times the yield surface, or, numbered otherwise, to 241.1.
#[test]
fn plastic_3d_frame3d_2_is_a_lower_bound_of_its_certificate() {
    let c = corpus_3d("frame3d-2");
    let inp = plastic_3d_input(&c);
    let cert = dedaliano_engine::certify::plastic_3d::certify_collapse_3d(&certifiable(&inp), None);
    assert!(cert.certified, "{cert:?}");
    let (lo, up) = (cert.lambda_lower.unwrap(), cert.lambda_upper.unwrap());
    assert!((lo - 176.467325809).abs() < 1e-6 && (up - lo) / up < 1e-9, "[{lo}, {up}]");
    // the transformed model is the same structure for the solver too
    let same = plastic::solve_plastic_3d(&certifiable(&inp)).unwrap();
    assert!(same.collapse_factor <= lo, "{}", same.collapse_factor);
    let r = plastic::solve_plastic_3d(&inp).unwrap();
    close(r.collapse_factor, 73.707122, 1e-6, "frame3d-2");
    assert!(r.collapse_factor <= lo && !r.is_mechanism, "{} vs [{lo}, {up}]", r.collapse_factor);
    assert!(r.warnings.iter().any(|w| w.contains("no consistent set of active hinges") && w.contains("lower bound")), "{:?}", r.warnings);
    assert!(!r.warnings.iter().any(|w| w.contains("exceeds the yield surface")), "{:?}", r.warnings);
}

/// Nightly findings that were harness defects (docs/verification/CONTAINMENT.md): each model,
/// replayed with its reported seed, holds the invariant it was reported to violate.
#[test]
fn nightly_harness_findings_hold() {
    let cases: &[(u32, u64, &[(&str, &str)])] = &[
        (971, 2026103104672, &[("P-Delta", "units")]),
        (974, 20757, &[("linear", "relabel"), ("P-Delta", "relabel"), ("cable solver", "relabel"), ("Winkler (no foundation)", "relabel")]),
        (992, 20758, &[("linear", "relabel"), ("linear (PCG)", "relabel"), ("linear (sparse path)", "relabel")]),
        (1002, 20758, &[("linear", "relabel"), ("linear (PCG)", "relabel"), ("linear (sparse path)", "relabel"), ("cable solver", "relabel")]),
        (1034, 20758, &[("harmonic", "superposition"), ("harmonic", "units"), ("harmonic", "rotation"), ("harmonic", "reversal")]),
        (1014, 20758, &[("linear", "superposition")]),
        (1022, 20758, &[("load combinations", "reversal")]),
        (1037, 20758, &[("load combinations", "superposition")]),
        (955, 20757, &[("linear", "mirror")]),
    ];
    for &(issue, seed, cells) in cases {
        let f = format!("{}/tests/metamorphic_corpus/nightly/issue-{issue}.json", env!("CARGO_MANIFEST_DIR"));
        let text = std::fs::read_to_string(&f).unwrap();
        let meta: serde_json::Value = serde_json::from_str(&text).unwrap();
        let dens: Option<std::collections::HashMap<String, f64>> = meta.get("_nightly_dens").map(|d| serde_json::from_value(d.clone()).unwrap());
        let name = format!("issue-{issue}");
        let t = crate::tally::Tally::default();
        let wanted = |n: &str| cells.iter().any(|c| c.0 == n);
        let invariants: Vec<&str> = cells.iter().map(|c| c.1).collect();
        match crate::corpus::parse(&text).unwrap() {
            crate::corpus::Model::D2(s) => {
                let mut c = crate::case::Case2::new(name, s);
                if let Some(d) = dens { c.dens = d; }
                let anas: Vec<_> = crate::ana2::rows().into_iter().filter(|a| wanted(a.name)).collect();
                crate::checks2::check_case(&crate::checks2::Ctx { tally: &t, rng_seed: seed }, &c, &anas, &invariants);
            }
            crate::corpus::Model::D3(s) => {
                let mut c = crate::case::Case3::new(name, s);
                if let Some(d) = dens { c.dens = d; }
                let anas: Vec<_> = crate::ana3::rows().into_iter().filter(|a| wanted(a.name)).collect();
                crate::checks3::check_case(&crate::checks3::Ctx { tally: &t, rng_seed: seed }, &c, &anas, &invariants);
            }
        }
        let cellmap = t.cells.lock().unwrap();
        for &(a, i) in cells {
            let cell = cellmap.get(&(a.to_string(), i.to_string())).unwrap_or_else(|| panic!("#{issue}: {a} × {i} not run"));
            assert!(cell.fails.is_empty(), "#{issue}: {a} × {i}: {:?}", cell.fails);
            assert!(cell.pass > 0, "#{issue}: {a} × {i} did not complete: {cell:?}");
        }
    }
}

/// #1192: a pinned and a rollerX support share node 2. Off the axes the roller
/// becomes an inclined roller, which the solver will not merge with another
/// support on the same node, so the image was refused while the original
/// solved.
#[test]
fn shared_node_supports_off_the_axes_are_unrepresentable() {
    let text = std::fs::read_to_string(format!("{}/tests/metamorphic_corpus/nightly/issue-1192.json", env!("CARGO_MANIFEST_DIR"))).unwrap();
    let crate::corpus::Model::D2(s) = crate::corpus::parse(&text).unwrap() else { panic!("2D model") };
    linear::solve_2d(&s).unwrap();
    for iso in [Iso2::mirror_line(0.4), Iso2::rotation(0.3)] {
        assert!(transform_2d(&s, &iso).is_err());
    }
    for iso in [Iso2::mirror_x(), Iso2::rotation(std::f64::consts::FRAC_PI_2)] {
        linear::solve_2d(&transform_2d(&s, &iso).unwrap()).unwrap();
    }
    let mut single = s.clone();
    single.supports.retain(|_, x| x.support_type != "pinned");
    assert_eq!(transform_2d(&single, &Iso2::rotation(0.3)).unwrap().supports["3"].support_type, "inclinedRoller");
    let t = crate::tally::Tally::default();
    let anas: Vec<_> = crate::ana2::rows().into_iter().filter(|a| a.name == "linear").collect();
    crate::checks2::check_case(&crate::checks2::Ctx { tally: &t, rng_seed: 2026110204434 }, &crate::case::Case2::new("issue-1192", s), &anas, &["mirror", "rotation"]);
    assert!(t.failures().is_empty(), "{:?}", t.failures());
}

/// #959: a cantilever under a purely transverse load has N = 0; its round-off
/// axial force (-3e-6 kN on EA/L = 1.3e7 kN/m) passed the absolute compression
/// test and gave load factors from 2.4e7 to 9.4e7, or a refusal, depending on
/// the model's orientation. Every orientation now refuses.
#[test]
fn buckling_without_compression_refuses_in_every_orientation() {
    let text = std::fs::read_to_string(format!("{}/tests/metamorphic_corpus/nightly/issue-959.json", env!("CARGO_MANIFEST_DIR"))).unwrap();
    let crate::corpus::Model::D2(s) = crate::corpus::parse(&text).unwrap() else { panic!("2D model") };
    assert!(s.loads.iter().all(|l| matches!(l, SolverLoad::Distributed(_))), "only member-local transverse loads turn with the nodes");
    for deg in [0.0f64, 37.0, 90.0, 180.0] {
        let (c, sn) = (deg.to_radians().cos(), deg.to_radians().sin());
        let mut r = s.clone();
        for n in r.nodes.values_mut() {
            (n.x, n.z) = (c * n.x - sn * n.z, sn * n.x + c * n.z);
        }
        let e = dedaliano_engine::solver::buckling::solve_buckling_2d(&r, 3).map(|b| b.modes.iter().map(|m| m.load_factor).collect::<Vec<_>>()).unwrap_err();
        assert!(e.contains("No compressed elements") || e.contains("Buckling not determinable"), "{deg}°: {e}");
    }
}

/// The #959 refusal bounds the round-off of N recovered from u_j − u_i, which grows with the
/// displacements themselves: a thermal compression a rigid translation leaves unchanged is
/// refused only past a translation of αΔT·L_e/(200ε) along the members (1.4e10 m here), never at a
/// physical one.
#[test]
fn restrained_thermal_compression_buckles_under_a_common_translation() {
    let column = |shift: f64| -> SolverInput {
        let support = |id: usize| json!({"id": id, "nodeId": id, "type": "fixed", "kx": null, "ky": null, "kz": null, "dx": shift, "dz": shift, "dry": null, "angle": null});
        serde_json::from_value(json!({
            "nodes": (1..=5).map(|i| (i.to_string(), json!({"id": i, "x": (i - 1) as f64, "z": 0.0}))).collect::<serde_json::Map<_, _>>(),
            "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-5}},
            "elements": (1..=4).map(|i| (i.to_string(), json!({"id": i, "type": "frame", "nodeI": i, "nodeJ": i + 1, "materialId": 1, "sectionId": 1, "hingeStart": false, "hingeEnd": false}))).collect::<serde_json::Map<_, _>>(),
            "supports": {"1": support(1), "5": support(5)},
            "loads": (1..=4).map(|i| json!({"type": "thermal", "data": {"elementId": i, "dtUniform": 50.0, "dtGradient": 0.0, "alpha": 1.2e-5}})).collect::<Vec<_>>(),
        })).unwrap()
    };
    let factor = |shift: f64| dedaliano_engine::solver::buckling::solve_buckling_2d(&column(shift), 1).unwrap_or_else(|e| panic!("shift {shift}: {e}")).modes[0].load_factor;
    let still = factor(0.0);
    let euler = 4.0 * std::f64::consts::PI.powi(2) * 2e8 * 1e-5 / 16.0 / (2e8 * 0.01 * 1.2e-5 * 50.0);
    assert!((still / euler - 1.0).abs() < 0.02, "{still} vs {euler}");
    for shift in [0.5, -30.0, 4.0e3, 1.0e6] {
        let moved = factor(shift);
        assert!((moved / still - 1.0).abs() < 1e-6, "shift {shift}: {moved} vs {still}");
    }
    let beyond = dedaliano_engine::solver::buckling::solve_buckling_2d(&column(2.0e10), 1).map(|b| b.modes[0].load_factor).unwrap_err();
    assert!(beyond.contains("Buckling not determinable") || beyond.contains("self-check static_balance"), "{beyond}");
}

#[test]
fn a_buckling_refusal_names_the_same_member_when_compressions_tie() {
    let twin = || -> SolverInput {
        let support = |id: usize| json!({"id": id, "nodeId": id, "type": "fixed", "dx": 2.0e10, "dz": 2.0e10});
        let nodes: serde_json::Map<_, _> = (0..2).flat_map(|c| (1..=3).map(move |i| ((3 * c + i).to_string(), json!({"id": 3 * c + i, "x": (i - 1) as f64, "z": 8.0 * c as f64}))) ).collect();
        let elements: serde_json::Map<_, _> = (0..2).flat_map(|c| (1..=2).map(move |i| { let id = 2 * c + i; (id.to_string(), json!({"id": id, "type": "frame", "nodeI": 3 * c + i, "nodeJ": 3 * c + i + 1, "materialId": 1, "sectionId": 1})) })).collect();
        serde_json::from_value(json!({
            "nodes": nodes, "elements": elements,
            "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-5}},
            "supports": {"1": support(1), "3": support(3), "4": support(4), "6": support(6)},
            "loads": (1..=4).map(|i| json!({"type": "thermal", "data": {"elementId": i, "dtUniform": 50.0, "dtGradient": 0.0, "alpha": 1.2e-5}})).collect::<Vec<_>>(),
        })).unwrap()
    };
    let first = dedaliano_engine::solver::buckling::solve_buckling_2d(&twin(), 1).map(|b| b.modes[0].load_factor).unwrap_err();
    assert!(first.contains("Buckling not determinable"), "{first}");
    for _ in 0..40 {
        assert_eq!(dedaliano_engine::solver::buckling::solve_buckling_2d(&twin(), 1).map(|b| b.modes[0].load_factor).unwrap_err(), first);
    }
}

/// #982: a third mode with λ ≈ 1e10 came from the round-off axial force of the
/// uncompressed cantilever, in some orientations only. Wherever such a mode is
/// returned it is named as unresolved, and the two physical modes never are.
#[test]
fn buckling_modes_from_round_off_compression_are_named_in_every_orientation() {
    let text = std::fs::read_to_string(format!("{}/tests/metamorphic_corpus/nightly/issue-982.json", env!("CARGO_MANIFEST_DIR"))).unwrap();
    let crate::corpus::Model::D2(s) = crate::corpus::parse(&text).unwrap() else { panic!("2D model") };
    assert!(s.loads.iter().all(|l| matches!(l, SolverLoad::Distributed(_))), "only member-local transverse loads turn with the nodes");
    for deg in [0.0f64, 37.0, 90.0, 180.0, 271.0] {
        let (c, sn) = (deg.to_radians().cos(), deg.to_radians().sin());
        let mut r = s.clone();
        for n in r.nodes.values_mut() {
            (n.x, n.z) = (c * n.x - sn * n.z, sn * n.x + c * n.z);
        }
        let b = dedaliano_engine::solver::buckling::solve_buckling_2d(&r, 3).unwrap();
        let factors: Vec<f64> = b.modes.iter().map(|m| m.load_factor).collect();
        let flagged = b.structured_diagnostics.iter().find(|d| d.phase.as_deref() == Some("BU-UNRESOLVED-MODE"));
        assert!((factors[0] / 0.168666176385 - 1.0).abs() < 1e-9 && (factors[1] / 2.18337895643 - 1.0).abs() < 1e-9, "{deg}°: {factors:?}");
        for (k, l) in factors.iter().enumerate() {
            let named = flagged.is_some_and(|d| d.message.contains(&format!("mode {} (", k + 1)));
            assert_eq!(named, *l > 1e6 * factors[0], "{deg}° mode {}: λ = {l:e}, {factors:?}", k + 1);
        }
        if let Some(d) = flagged {
            assert_eq!(d.severity, Severity::Warning);
            assert_eq!(d.element_ids, vec![2], "the uncompressed cantilever drives it");
        }
    }
    let column = |p: f64| s2(json!({
        "nodes": {"0": {"id": 0, "x": 0.0, "z": 0.0}, "1": {"id": 1, "x": 0.0, "z": 2.0}, "2": {"id": 2, "x": 0.0, "z": 4.0}},
        "elements": {"1": {"id": 1, "type": "frame", "nodeI": 0, "nodeJ": 1, "materialId": 1, "sectionId": 1}, "2": {"id": 2, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
        "supports": {"1": {"id": 1, "nodeId": 0, "type": "fixed"}},
        "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -p, "my": 0.0}}],
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}}
    }));
    for p in [100.0, 1e-5] {
        let b = dedaliano_engine::solver::buckling::solve_buckling_2d(&column(p), 3).unwrap();
        assert_eq!(b.modes.len(), 3);
        assert!(!b.structured_diagnostics.iter().any(|d| d.phase.as_deref() == Some("BU-UNRESOLVED-MODE")), "P = {p}: {:?}", b.structured_diagnostics);
    }
}

/// The round-off threshold is per member and counts only the displacement
/// components along it: a compressed column keeps its load factor next to an
/// uncompressed, very flexible cantilever, a column under 1e-5 kN still
/// buckles, and so does a slender horizontal cantilever under 1e-5 kN whose
/// tip deflects 1.7e5 m transversely (λ ≈ 0.49, Codex review).
#[test]
fn buckling_compression_threshold_is_per_member() {
    let column = |p: f64, beam: bool| {
        let mut nodes = serde_json::Map::new();
        let mut elements = serde_json::Map::new();
        for k in 0..=10 {
            nodes.insert(k.to_string(), json!({"id": k, "x": 0.0, "z": 0.5 * k as f64}));
        }
        for k in 1..=10 {
            elements.insert(k.to_string(), json!({"id": k, "type": "frame", "nodeI": k - 1, "nodeJ": k, "materialId": 1, "sectionId": 1}));
        }
        let mut supports = json!({"1": {"id": 1, "nodeId": 0, "type": "fixed"}});
        let mut loads = vec![json!({"type": "nodal", "data": {"nodeId": 10, "fx": 0.0, "fz": -p, "my": 0.0}})];
        if beam {
            nodes.insert("20".into(), json!({"id": 20, "x": 50.0, "z": 0.0}));
            nodes.insert("21".into(), json!({"id": 21, "x": 150.0, "z": 0.0}));
            elements.insert("20".into(), json!({"id": 20, "type": "frame", "nodeI": 20, "nodeJ": 21, "materialId": 1, "sectionId": 2}));
            supports["2"] = json!({"id": 2, "nodeId": 20, "type": "fixed"});
            loads.push(json!({"type": "nodal", "data": {"nodeId": 21, "fx": 0.0, "fz": -100.0, "my": 0.0}}));
        }
        s2(json!({
            "nodes": nodes, "elements": elements, "supports": supports, "loads": loads,
            "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}, "2": {"id": 2, "a": 0.01, "iz": 1e-6}}
        }))
    };
    let euler = std::f64::consts::PI.powi(2) * 200e6 * 1e-4 / (4.0 * 25.0);
    let first = |s: &SolverInput| dedaliano_engine::solver::buckling::solve_buckling_2d(s, 1).unwrap().modes[0].load_factor;
    let alone = first(&column(10.0, false));
    assert!((alone * 10.0 / euler - 1.0).abs() < 1e-3, "{alone} vs {}", euler / 10.0);
    let tip = linear::solve_2d(&column(10.0, true)).unwrap().displacements.iter().find(|d| d.node_id == 21).unwrap().uz;
    assert!(tip.abs() > 1e3, "{tip}");
    close(first(&column(10.0, true)), alone, 1e-9, "column next to a flexible beam");
    let tiny = first(&column(1e-5, false));
    close(tiny * 1e-5, alone * 10.0, 1e-6, "column under 1e-5 kN");

    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    for k in 0..=10 {
        nodes.insert(k.to_string(), json!({"id": k, "x": 10.0 * k as f64, "z": 0.0}));
    }
    for k in 1..=10 {
        elements.insert(k.to_string(), json!({"id": k, "type": "frame", "nodeI": k - 1, "nodeJ": k, "materialId": 1, "sectionId": 1}));
    }
    let slender = s2(json!({
        "nodes": nodes, "elements": elements,
        "supports": {"1": {"id": 1, "nodeId": 0, "type": "fixed"}},
        "loads": [{"type": "nodal", "data": {"nodeId": 10, "fx": -1e-5, "fz": 0.01, "my": 0.0}}],
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-10}}
    }));
    let tip = linear::solve_2d(&slender).unwrap().displacements.iter().find(|d| d.node_id == 10).unwrap().uz;
    assert!(tip.abs() > 1e5, "{tip}");
    let euler = std::f64::consts::PI.powi(2) * 200e6 * 1e-10 / (4.0 * 1e4 * 1e-5);
    let lambda = first(&slender);
    assert!((lambda / euler - 1.0).abs() < 1e-3, "{lambda} vs {euler}");
}

/// #1030: mirrored about node 3, the model is two independent cantilevers
/// with the same modes; the 2D spectral row took 4 modes, which ended between
/// the two copies of the second mode (12.83 Hz), so one cantilever had it and
/// the other did not. The row now extends the cut to the end of a cluster.
#[test]
fn spectral_symmetry_keeps_repeated_pairs_whole() {
    let text = std::fs::read_to_string(format!("{}/tests/metamorphic_corpus/nightly/issue-1030.json", env!("CARGO_MANIFEST_DIR"))).unwrap();
    let crate::corpus::Model::D2(s) = crate::corpus::parse(&text).unwrap() else { panic!("2D model") };
    let sym = crate::symmetry::symmetrize_2d("issue-1030", &s, false).unwrap();
    let t = crate::tally::Tally::default();
    let anas: Vec<_> = crate::ana2::rows().into_iter().filter(|a| a.name == "spectral").collect();
    crate::symmetry::check_2d(&t, &sym, false, &anas);
    let cells = t.cells.lock().unwrap();
    let cell = cells.get(&("spectral".to_string(), "symmetry".to_string())).expect("spectral × symmetry ran");
    assert!(cell.fails.is_empty() && cell.pass > 0, "{cell:?}");
}

#[test]
fn a_section_shared_by_two_materials_gets_one_fiber_material_in_any_order() {
    let mut materials = std::collections::HashMap::new();
    for (id, e) in [(1, 2089.9), (2, 6030.9), (3, 2089.9)] {
        materials.insert(id.to_string(), SolverMaterial { id, e, nu: 0.3 });
    }
    let pick = |ids: &[usize]| crate::ana2::section_material(&materials, ids.iter().copied()).map(|m| m.id);
    for ids in [[1, 2, 3], [2, 1, 3], [3, 1, 2], [3, 2, 1]] {
        assert_eq!(pick(&ids), Some(2), "{ids:?}");
    }
    assert_eq!(pick(&[]), None);
}

#[test]
fn a_negative_expansion_coefficient_raises_the_comparison_floor_as_a_positive_one_does() {
    let heated = |alpha: f64| -> (SolverInput, SolverInput3D) {
        let support = |id: usize| json!({"id": id, "nodeId": id, "type": "fixed"});
        let s2: SolverInput = serde_json::from_value(json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "z": 0.0}, "2": {"id": 2, "x": 4.0, "z": 0.0}},
            "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-5}},
            "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
            "supports": {"1": support(1)},
            "loads": [{"type": "thermal", "data": {"elementId": 1, "dtUniform": 50.0, "dtGradient": 10.0, "alpha": alpha}}],
        })).unwrap();
        let s3: SolverInput3D = serde_json::from_value(json!({
            "nodes": {"1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0}, "2": {"id": 2, "x": 4.0, "y": 0.0, "z": 0.0}},
            "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": 0.01, "iy": 1e-5, "iz": 1e-5, "j": 1e-5}},
            "elements": {"1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
            "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
            "loads": [{"type": "thermal", "data": {"elementId": 1, "dtUniform": 50.0, "dtGradientY": 10.0, "dtGradientZ": 10.0, "alpha": alpha}}],
        })).unwrap();
        (s2, s3)
    };
    let (p2, p3) = heated(1.2e-5);
    let (n2, n3) = heated(-1.2e-5);
    let f2 = crate::checks2::load_floor_2d(&p2, 4.0);
    let f3 = crate::checks3::load_floor_3d(&p3, 4.0);
    assert!(f2 > 0.0 && f3 > 0.0, "{f2} {f3}");
    assert_eq!(crate::checks2::load_floor_2d(&n2, 4.0), f2);
    assert_eq!(crate::checks3::load_floor_3d(&n3, 4.0), f3);
}

/// A general rotation makes the semidefinite drilling-mass reduction refuse
/// this shell, selecting the direct harmonic fallback. Both paths must use
/// the same Rayleigh anchors even though the sweep keeps only one mode.
#[test]
fn harmonic_shell_rotation_preserves_damping_across_fallback() {
    let s = serde_json::from_str(include_str!(
        "../metamorphic_corpus/feature_matrix/3d-quad-shell--mitc4--strip-cantilever------0-with.json"
    )).unwrap();
    let c = crate::case::Case3::new(
        "feature_matrix/3d-quad-shell--mitc4--strip-cantilever------0-with", s,
    );
    let tally = crate::tally::Tally::default();
    let ctx = crate::checks3::Ctx { tally: &tally, rng_seed: 20261018 };
    let analyses: Vec<_> = crate::ana3::rows().into_iter().filter(|a| a.name == "harmonic").collect();
    crate::checks3::check_case(&ctx, &c, &analyses, &["rotation"]);
    assert_eq!(tally.status("harmonic", "rotation"), "holds", "{}", tally.report());
}

fn issue_758_plastic_input(c: &Case2) -> PlasticInput {
    let sections = c.s.sections.values().map(|x| {
        let (b, h) = crate::ana2::rect(x.a, x.iz);
        let mat = c.s.elements.values().find(|e| e.section_id == x.id).map_or(1, |e| e.material_id);
        (x.id.to_string(), PlasticSectionData { a: x.a, iz: x.iz, material_id: mat, b: Some(b), h: Some(h) })
    }).collect();
    let materials = c.s.materials.values().map(|x| (x.id.to_string(), PlasticMaterialData { fy: Some(c.p.fy) })).collect();
    PlasticInput { solver: c.s.clone(), sections, materials, max_hinges: None, mp_overrides: None }
}

type Limit758 = fn(&dedaliano_engine::solver::plastic_limit::LimitInput) -> Result<dedaliano_engine::solver::plastic_limit::LimitResult, String>;

fn issue_758_limit(c: &Case2, limit: Limit758) -> Result<f64, String> {
    let inp = issue_758_plastic_input(c);
    let by_section = plastic::section_plastic_moments(&inp);
    let mp = c.s.elements.values().filter(|e| e.elem_type == "frame").map(|e| (e.id.to_string(), by_section[&e.section_id])).collect();
    limit(&dedaliano_engine::solver::plastic_limit::LimitInput { solver: c.s.clone(), mp, np: Default::default() }).map(|l| l.lambda)
}

fn issue_758_public_entry_is_withheld(c: &Case2) {
    let refusal = plastic::solve_plastic_2d(&issue_758_plastic_input(c)).expect_err("solve_plastic_2d stays withheld until PL-2D-INVARIANCE is lifted");
    assert!(refusal.contains("PL-2D-INVARIANCE"), "{refusal}");
}

const ISSUE_758_MECHANISM: &str = "the structure is a mechanism before any hinge forms";

const ISSUE_758_CASES: &[(u64, &str, Option<f64>)] = &[
    (20754, "feature_matrix/2d-constraint--rigid-link--offset-beam-with", Some(46.666666666666686)),
    (20754, "fuzz_rich_2d/20772", Some(0.06569871968509293)),
    (20754, "fuzz_rich_2d/20787", None),
    (20754, "fuzz_rich_2d/20800", None),
    (20754, "fuzz_rich_2d/20832", Some(123.29270872808767)),
    (20754, "fuzz_rich_2d/20833", None),
    (20754, "fuzz_rich_2d/20840", Some(0.27500611582047574)),
    (20754, "fuzz_rich_2d/20843", Some(80.12437234517034)),
    (20749, "feature_matrix/2d-constraint--rigid-link--offset-beam-with", Some(46.666666666666686)),
    (20749, "fuzz_rich_2d/20772", Some(0.7290143868872333)),
    (20749, "fuzz_rich_2d/20787", Some(1.7049195603727287)),
    (20749, "fuzz_rich_2d/20800", None),
    (20749, "fuzz_rich_2d/20832", Some(123.29270872808767)),
    (20749, "fuzz_rich_2d/20833", None),
    (20749, "fuzz_rich_2d/20840", None),
    (20749, "fuzz_rich_2d/20843", Some(71.71445604810637)),
];

fn issue_758_allowed_refusal(corpus: u64, name: &str, transform: &str, seed: u64) -> Option<&'static str> {
    (corpus == 20749 && name == "fuzz_rich_2d/20772" && transform == "units" && [1, 2, 5, 6].contains(&seed)).then_some("self-check static_residual")
}

fn issue_758_invariance(transform: &str, limit: Limit758) {
    use dedaliano_engine::metamorphic::{relabel::Relabel, reversal::reverse_2d, units::Units};
    let mut failures = Vec::new();
    let mut seen = 0;
    for corpus in [20754, 20749] {
        for c in crate::corpus::cases_2d(crate::corpus::Tier::Nightly, corpus) {
            let Some(&(_, _, expected)) = ISSUE_758_CASES.iter().find(|(k, n, _)| *k == corpus && *n == c.name) else { continue };
            seen += 1;
            issue_758_public_entry_is_withheld(&c);
            let check = |what: String, r: Result<f64, String>, refusal: Option<&str>, failures: &mut Vec<String>| match (expected, r, refusal) {
                (Some(want), Ok(got), None) if (got - want).abs() <= 1e-9 * want.abs() => {}
                (Some(_), Err(e), Some(reason)) if e.contains(reason) => {}
                (None, Err(e), _) if e.contains(ISSUE_758_MECHANISM) => {}
                (_, r, _) => failures.push(format!("{corpus} {} {what}: expected {expected:?}, got {r:?}", c.name)),
            };
            check("base".into(), issue_758_limit(&c, limit), None, &mut failures);
            for seed in 0..8 {
                let other = match transform {
                    "relabel" => c.relabel(&Relabel::random_2d(&c.s, seed), seed),
                    "reversal" => Case2 { s: reverse_2d(&c.s, &|id| (id + seed as usize) % 3 != 0), ..c.clone() },
                    _ => c.units(&Units::froude([1e-3, 25.0, 0.3048, 1e3][seed as usize % 4], [1e3, 1e-2, 4.448, 1e3][seed as usize % 4])),
                };
                check(format!("{transform}/{seed}"), issue_758_limit(&other, limit), issue_758_allowed_refusal(corpus, &c.name, transform, seed), &mut failures);
            }
        }
    }
    assert_eq!(seen, ISSUE_758_CASES.len(), "missing reproduction cases");
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}

#[test]
fn issue_758_renumbering() { issue_758_invariance("relabel", |i| limit_analysis_2d_input(i)); }
#[test]
fn issue_758_member_reversal() { issue_758_invariance("reversal", |i| limit_analysis_2d_input(i)); }
#[test]
fn issue_758_units() { issue_758_invariance("units", |i| limit_analysis_2d_input(i)); }


#[test]
fn issue_758_stiff_link_collapses_like_the_rigid_link() {
    use dedaliano_engine::metamorphic::{relabel::Relabel, reversal::reverse_2d, units::Units};
    let run = |c: &Case2| issue_758_limit(c, |i| limit_analysis_2d_input(i)).unwrap();
    let cases: Vec<Case2> = crate::corpus::cases_2d(crate::corpus::Tier::Pr, 20261018).into_iter().chain(crate::corpus::cases_2d(crate::corpus::Tier::Nightly, 20754)).collect();
    let case = |suffix: &str| cases.iter().find(|c| c.name.contains(&format!("2d-constraint--rigid-link--offset-beam-{suffix}"))).unwrap().clone();
    let (with, equiv) = (case("with"), case("equiv"));
    let reference = run(&with);
    close(reference, 140.0 / 3.0, 1e-7, "rigid link");
    for seed in 0..4 {
        for (what, other) in [
            ("as given", equiv.clone()),
            ("relabel", equiv.relabel(&Relabel::random_2d(&equiv.s, seed), seed)),
            ("reversal", Case2 { s: reverse_2d(&equiv.s, &|id| (id + seed as usize) % 2 == 0), ..equiv.clone() }),
            ("units", equiv.units(&Units::froude([1e-3, 25.0, 0.3048, 1e3][seed as usize], [1e3, 1e-2, 4.448, 1e3][seed as usize]))),
        ] {
            close(run(&other), reference, 1e-7, &format!("stiff link {what}/{seed}"));
        }
    }
    let beam_e = equiv.s.elements.values().find(|e| e.id == 1).and_then(|e| equiv.s.materials.values().find(|m| m.id == e.material_id)).unwrap().e;
    let link_material = equiv.s.elements.values().find(|e| e.id == 2).unwrap().material_id;
    for ratio in [1e2, 1e4, 1e6, 1e8] {
        let mut swept = equiv.clone();
        swept.s.materials.values_mut().filter(|m| m.id == link_material).for_each(|m| m.e = beam_e * ratio);
        close(run(&swept), reference, 1e-7, &format!("link {ratio:e} times as stiff"));
    }
}

#[test]
fn issue_758_axial_self_stress_round_off_is_not_a_bending_redundancy() {
    let cases = crate::corpus::cases_2d(crate::corpus::Tier::Nightly, 40000);
    let c = cases.iter().find(|c| c.name.contains("2d-prescribed-displacement-support-settlement-equiv")).unwrap().clone();
    let run = issue_758_plastic_input;
    let base = run(&c);
    let cert = dedaliano_engine::certify::plastic::certify_collapse_2d(&base, None);
    let exact = cert.lambda_upper.unwrap();
    assert!(cert.certified && (cert.lambda_lower.unwrap() - exact).abs() <= 1e-9 * exact, "{cert:?}");
    for phi in [0.3, 1.1, 2.0, -0.7] {
        for (what, iso) in [("rotation", Iso2::rotation(phi)), ("mirror", Iso2::mirror_line(phi))] {
            let lambda = issue_758_limit(&c.iso(&iso).unwrap(), |i| limit_analysis_2d_input(i)).unwrap();
            close(lambda, exact, 1e-9, &format!("{what} {phi}"));
        }
    }
}

#[test]
fn issue_758_confirmation_rejects_the_earlier_unconservative_factors() {
    use dedaliano_engine::metamorphic::transform::Iso2;
    use dedaliano_engine::solver::plastic_limit::{confirm_2d, Confirmation};
    let input = |c: &Case2| {
        let sections = c.s.sections.values().map(|x| {
            let (b, h) = crate::ana2::rect(x.a, x.iz);
            let mat = c.s.elements.values().find(|e| e.section_id == x.id).map_or(1, |e| e.material_id);
            (x.id.to_string(), PlasticSectionData { a: x.a, iz: x.iz, material_id: mat, b: Some(b), h: Some(h) })
        }).collect();
        let materials = c.s.materials.values().map(|x| (x.id.to_string(), PlasticMaterialData { fy: Some(c.p.fy) })).collect();
        let inp = PlasticInput { solver: c.s.clone(), sections, materials, max_hinges: None, mp_overrides: None };
        let by_section = plastic::section_plastic_moments(&inp);
        let mp: std::collections::HashMap<usize, f64> = c.s.elements.values().map(|e| (e.id, by_section[&e.section_id])).collect();
        (inp, mp)
    };
    let none = std::collections::HashMap::new();
    let cases: Vec<Case2> = crate::corpus::cases_2d(crate::corpus::Tier::Pr, 20261018).into_iter().chain(crate::corpus::cases_2d(crate::corpus::Tier::Nightly, 40000)).collect();
    let find = |name: &str| cases.iter().find(|c| c.name.contains(name)).unwrap().clone();

    let (link, mp) = input(&find("2d-constraint--rigid-link--offset-beam-equiv"));
    assert_eq!(confirm_2d(&link.solver, &mp, &none, 140.0 / 3.0), Confirmation::Exact);
    assert!(matches!(confirm_2d(&link.solver, &mp, &none, 48770.074890207594), Confirmation::Contradicted { reason, lower } if reason.contains("bounds the collapse factor") && lower <= 140.0 / 3.0 && lower >= 140.0 / 3.0 * (1.0 - 1e-6)));

    let settlement = find("2d-prescribed-displacement-support-settlement-equiv");
    let (base, mp) = input(&settlement);
    assert_eq!(confirm_2d(&base.solver, &mp, &none, 10.904960242330917), Confirmation::Exact);
    let (rotated, mp) = input(&settlement.iso(&Iso2::rotation(0.3)).unwrap());
    let scope = confirm_2d(&rotated.solver, &mp, &none, 148.88932546775965);
    assert!(matches!(scope, Confirmation::OutOfScope { ref reason } if reason.contains("inclined")), "{scope:?}");
    assert!(scope.accept(148.88932546775965, Some(10.904960242330917), 1e-6).is_err());
    assert!(plastic::solve_plastic_2d(&rotated).is_err_and(|e| e.contains("PL-2D-INVARIANCE")));
}

#[test]
fn issue_758_when_the_limit_analysis_fails_the_exact_certificate_still_checks_the_history() {
    use dedaliano_engine::metamorphic::transform::Iso2;
    let cases = crate::corpus::cases_2d(crate::corpus::Tier::Nightly, 66800);
    let c = cases.iter().find(|c| c.name.contains("settlement-equiv")).unwrap().clone();
    let t = c.iso(&Iso2::rotation(4.712398194981313).translated(-14.230913986567536, -19.647139184364594)).unwrap();
    let sections = t.s.sections.values().map(|x| {
        let (b, h) = crate::ana2::rect(x.a, x.iz);
        let mat = t.s.elements.values().find(|e| e.section_id == x.id).map_or(1, |e| e.material_id);
        (x.id.to_string(), PlasticSectionData { a: x.a, iz: x.iz, material_id: mat, b: Some(b), h: Some(h) })
    }).collect();
    let materials = t.s.materials.values().map(|x| (x.id.to_string(), PlasticMaterialData { fy: Some(t.p.fy) })).collect();
    let inp = PlasticInput { solver: t.s.clone(), sections, materials, max_hinges: None, mp_overrides: None };
    let by = plastic::section_plastic_moments(&inp);
    let mp: std::collections::HashMap<usize, f64> = t.s.elements.values().map(|e| (e.id, by[&e.section_id])).collect();
    assert!(plastic::solve_plastic_2d(&inp).is_err_and(|e| e.contains("PL-2D-INVARIANCE")));
    let verdict = dedaliano_engine::solver::plastic_limit::confirm_2d(&t.s, &mp, &Default::default(), 399.9960419608519);
    let dedaliano_engine::solver::plastic_limit::Confirmation::Contradicted { lower, .. } = verdict else { panic!("{verdict:?}") };
    assert!(lower > 30.0 * 10.904960242330917, "a roller 1.4e-6 rad off the member axis props the tip: {lower}");
}

pub(crate) fn gauss_complex(k: &[f64], m: &[f64], c: &[f64], f: &[f64], n: usize, w: f64) -> (Vec<f64>, Vec<f64>) {
    let n2 = 2 * n;
    let w1 = n2 + 1;
    let mut a = vec![0.0; n2 * w1];
    for i in 0..n {
        for j in 0..n {
            let d = k[i * n + j] - w * w * m[i * n + j];
            let wc = w * c[i * n + j];
            a[i * w1 + j] = d;
            a[i * w1 + n + j] = -wc;
            a[(n + i) * w1 + j] = wc;
            a[(n + i) * w1 + n + j] = d;
        }
        a[i * w1 + n2] = f[i];
    }
    for col in 0..n2 {
        let p = (col..n2).max_by(|&x, &y| a[x * w1 + col].abs().total_cmp(&a[y * w1 + col].abs())).unwrap();
        for j in 0..w1 {
            a.swap(col * w1 + j, p * w1 + j);
        }
        let piv = a[col * w1 + col];
        for r in (0..n2).filter(|&r| r != col) {
            let fct = a[r * w1 + col] / piv;
            for j in col..w1 {
                a[r * w1 + j] -= fct * a[col * w1 + j];
            }
        }
    }
    let x: Vec<f64> = (0..n2).map(|i| a[i * w1 + n2] / a[i * w1 + i]).collect();
    (x[..n].to_vec(), x[n..].to_vec())
}

/// #1371: on the C2-symmetric copies of a frame with one very soft mode,
/// modal superposition with the static correction was off by up to 79× at
/// 2.3 Hz. Every reported value must match two independent direct complex
/// solves, and the on-axis components symmetry forces to zero must be zero.
#[test]
fn harmonic_c2_symmetric_frame_matches_direct_solve() {
    use dedaliano_engine::solver::{assembly, dof::DofNumbering, harmonic, mass_matrix};
    let text = std::fs::read_to_string(format!("{}/tests/metamorphic_corpus/nightly/issue-1371.json", env!("CARGO_MANIFEST_DIR"))).unwrap();
    let c = crate::case::Case3::new("issue-1371", serde_json::from_str(&text).unwrap());
    for anti in [false, true] {
        let sym = crate::symmetry::symmetrize_3d(&c.name, &c.s, anti).unwrap();
        let sc = &sym.case;
        let node = sc.probes[0];
        let dn = DofNumbering::build_3d(&sc.s);
        let (nf, n) = (dn.n_free, dn.n_total);
        let asm = assembly::assemble_3d(&sc.s, &dn);
        let m = mass_matrix::assemble_mass_matrix_3d(&sc.s, &dn, &sc.dens);
        let kff: Vec<f64> = (0..nf * nf).map(|i| asm.k[(i / nf) * n + i % nf]).collect();
        let mff: Vec<f64> = (0..nf * nf).map(|i| m[(i / nf) * n + i % nf]).collect();
        let ff = &asm.f[..nf];
        let mut rows = Vec::new();
        for (di, dof) in ["x", "y", "z"].into_iter().enumerate() {
            let inp = harmonic::HarmonicInput3D {
                solver: sc.s.clone(), densities: sc.dens.clone(), frequencies: sc.p.freqs.clone(),
                damping_ratio: 0.05, response_node_id: node, response_dof: dof.into(),
            };
            let (r, (a0, a1)) = harmonic::solve_harmonic_3d_with_damping(&inp).unwrap();
            let cff: Vec<f64> = (0..nf * nf).map(|i| a0 * mff[i] + a1 * kff[i]).collect();
            let g = dn.global_dof(node, di).unwrap();
            for pt in &r.response_points {
                let (lu_re, lu_im) = harmonic::solve_complex_system(&kff, &mff, &cff, ff, nf, pt.omega).unwrap();
                let (ge_re, ge_im) = gauss_complex(&kff, &mff, &cff, ff, nf, pt.omega);
                rows.push((di, pt.frequency, (pt.real, pt.imag), (lu_re[g], lu_im[g]), (ge_re[g], ge_im[g])));
            }
        }
        let scale = rows.iter().map(|r| r.3 .0.hypot(r.3 .1)).fold(0.0f64, f64::max);
        assert!(scale > 0.0);
        let copy = if anti { "anti" } else { "sym" };
        for (di, f, got, lu, ge) in rows {
            let diff = |a: (f64, f64), b: (f64, f64)| (a.0 - b.0).hypot(a.1 - b.1) / scale;
            assert!(diff(lu, ge) < 1e-9, "{copy} u{di} at {f} Hz: the two direct solves disagree: {lu:?} vs {ge:?}");
            assert!(diff(got, lu) < 1e-6, "{copy} u{di} at {f} Hz: reported {got:?}, direct {lu:?} (scale {scale:.3e})");
            if (anti && di == 2) || (!anti && di < 2) {
                assert!(got.0.hypot(got.1) / scale < 1e-6, "{copy} u{di} at {f} Hz is zero by symmetry, got {got:?} (scale {scale:.3e})");
            }
        }
    }
    let tally = crate::tally::Tally::default();
    let analyses: Vec<_> = crate::ana3::rows().into_iter().filter(|a| a.name == "harmonic").collect();
    for anti in [false, true] {
        crate::symmetry::check_3d(&tally, &crate::symmetry::symmetrize_3d(&c.name, &c.s, anti).unwrap(), anti, &analyses);
    }
    assert_eq!(tally.status("harmonic", "symmetry"), "holds", "{}", tally.report());
}

#[test]
fn a_mirrored_frame_flips_what_acts_along_local_z() {
    let s: SolverInput3D = serde_json::from_value(json!({
        "nodes": {
            "1": {"id": 1, "x": 0.0, "y": 0.0, "z": 0.0},
            "2": {"id": 2, "x": 3.0, "y": 1.0, "z": 2.0},
            "3": {"id": 3, "x": 5.0, "y": 1.5, "z": 4.0}
        },
        "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
        "sections": {"1": {"id": 1, "a": 0.01, "iy": 2e-4, "iz": 1e-4, "j": 5e-5, "shearCenterY": 0.02, "shearCenterZ": 0.05}},
        "elements": {
            "1": {"id": 1, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1},
            "2": {"id": 2, "type": "frame", "nodeI": 2, "nodeJ": 3, "materialId": 1, "sectionId": 1}
        },
        "supports": {"1": {"nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true}},
        "loads": [
            {"type": "thermal", "data": {"elementId": 1, "dtUniform": 0.0, "dtGradientY": 0.0, "dtGradientZ": 40.0, "alpha": 1.2e-5}},
            {"type": "distributed", "data": {"elementId": 2, "qYI": 1.0, "qYJ": 1.0, "qZI": -3.0, "qZJ": -1.0}},
            {"type": "pointOnElement", "data": {"elementId": 1, "a": 1.5, "py": 0.5, "pz": 2.0}},
            {"type": "nodal", "data": {"nodeId": 3, "fx": -40.0, "fy": 1.0, "fz": -2.0, "mx": 0.5, "my": -1.0, "mz": 0.3}}
        ]
    }))
    .unwrap();
    let c = crate::case::Case3::new("mirror-local-z", s);
    let analyses: Vec<_> = crate::ana3::rows().into_iter().filter(|a| ["linear", "P-Delta"].contains(&a.name)).collect();
    for seed in 0..6 {
        let tally = crate::tally::Tally::default();
        crate::checks3::check_case(&crate::checks3::Ctx { tally: &tally, rng_seed: seed }, &c, &analyses, &["mirror"]);
        for a in &analyses {
            assert_eq!(tally.status(a.name, "mirror"), "holds", "seed {seed}: {}", tally.report());
        }
    }
}

/// #982 in 3D: the uncompressed cantilever's round-off axial force gives a third mode
/// with λ ≈ 1e10 in some orientations. Embedded in each coordinate plane, turned in it
/// and permuted across the axes, at any load scale, such a mode is named and the two
/// physical modes never are.
#[test]
fn buckling_modes_from_round_off_compression_are_named_in_3d_in_every_plane_and_orientation() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
    use dedaliano_engine::metamorphic::transform::transform_3d;
    let text = std::fs::read_to_string(format!("{}/tests/metamorphic_corpus/nightly/issue-982.json", env!("CARGO_MANIFEST_DIR"))).unwrap();
    let crate::corpus::Model::D2(s) = crate::corpus::parse(&text).unwrap() else { panic!("2D model") };
    let unresolved = |b: &dedaliano_engine::solver::buckling::BucklingResult3D| b.structured_diagnostics.iter().find(|d| d.phase.as_deref() == Some("BU-UNRESOLVED-MODE")).cloned();
    let (mut solved, mut named) = (0, 0);
    for plane in Plane::ALL {
        for deg in [0.0f64, 1.0, 13.0, 90.0, 121.0, 271.0] {
            let planar = embed_2d(&transform_2d(&s, &Iso2::rotation(deg.to_radians())).unwrap(), plane).unwrap();
            for k in 0..24 {
                let Ok(model) = transform_3d(&planar, &Iso3::axis_permutation(k)) else { continue };
                for load in [1.0, 1e-6, 1e6] {
                    let mut scaled = model.clone();
                    for l in scaled.loads.iter_mut() {
                        let SolverLoad3D::Distributed(d) = l else { panic!("only distributed loads") };
                        (d.q_yi, d.q_yj, d.q_zi, d.q_zj) = (d.q_yi * load, d.q_yj * load, d.q_zi * load, d.q_zj * load);
                    }
                    let b = dedaliano_engine::solver::buckling::solve_buckling_3d(&scaled, 3).unwrap_or_else(|e| panic!("{plane:?} {deg}° {k} ×{load}: {e}"));
                    let factors: Vec<f64> = b.modes.iter().map(|m| m.load_factor * load).collect();
                    let at = format!("{plane:?} {deg}° permutation {k} load ×{load}: {factors:?}");
                    assert!((factors[0] / 0.168666176385 - 1.0).abs() < 1e-9 && (factors[1] / 2.18337895643 - 1.0).abs() < 1e-9, "{at}");
                    let flagged = unresolved(&b);
                    for (m, l) in factors.iter().enumerate() {
                        let is_named = flagged.as_ref().is_some_and(|d| d.message.contains(&format!("mode {} (", m + 1)));
                        assert_eq!(is_named, *l > 1e6 * factors[0], "{at}, mode {}", m + 1);
                    }
                    if let Some(d) = flagged {
                        assert_eq!(d.severity, Severity::Warning, "{at}");
                        assert_eq!(d.element_ids, vec![2], "{at}: the uncompressed cantilever drives it");
                        named += 1;
                    }
                    solved += 1;
                }
            }
        }
    }
    assert!(solved >= 300 && named >= 100, "{solved} solved, {named} named");
}

/// The 3D mode check against what a real compression gives: a cantilever column under
/// 100 kN or 1e-5 kN in any coordinate plane, and the same column beside a flexible
/// uncompressed cantilever, keep every mode unnamed.
#[test]
fn physical_3d_buckling_modes_are_not_named_unresolved() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
    let column = |p: f64, beside: bool| {
        let mut v = json!({
            "nodes": {"0": {"id": 0, "x": 0.0, "z": 0.0}, "1": {"id": 1, "x": 0.0, "z": 2.0}, "2": {"id": 2, "x": 0.0, "z": 4.0}},
            "elements": {"1": {"id": 1, "type": "frame", "nodeI": 0, "nodeJ": 1, "materialId": 1, "sectionId": 1}, "2": {"id": 2, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
            "supports": {"1": {"id": 1, "nodeId": 0, "type": "fixed"}},
            "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -p, "my": 0.0}}],
            "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}, "2": {"id": 2, "a": 0.01, "iz": 1e-6}}
        });
        if beside {
            v["nodes"]["20"] = json!({"id": 20, "x": 50.0, "z": 0.0});
            v["nodes"]["21"] = json!({"id": 21, "x": 150.0, "z": 0.0});
            v["elements"]["20"] = json!({"id": 20, "type": "frame", "nodeI": 20, "nodeJ": 21, "materialId": 1, "sectionId": 2});
            v["supports"]["2"] = json!({"id": 2, "nodeId": 20, "type": "fixed"});
            v["loads"].as_array_mut().unwrap().push(json!({"type": "nodal", "data": {"nodeId": 21, "fx": 0.0, "fz": -100.0, "my": 0.0}}));
        }
        s2(v)
    };
    let euler = std::f64::consts::PI.powi(2) * 200e6 * 1e-4 / (4.0 * 16.0);
    for plane in Plane::ALL {
        for (p, beside) in [(100.0, false), (1e-5, false), (100.0, true)] {
            let b = dedaliano_engine::solver::buckling::solve_buckling_3d(&embed_2d(&column(p, beside), plane).unwrap(), 3).unwrap();
            assert!((b.modes[0].load_factor * p / euler - 1.0).abs() < 1e-2, "{plane:?} P = {p}: {}", b.modes[0].load_factor);
            assert!(!b.structured_diagnostics.iter().any(|d| d.phase.as_deref() == Some("BU-UNRESOLVED-MODE")), "{plane:?} P = {p}, beside {beside}: {:?}", b.structured_diagnostics);
        }
    }
}

/// Each member's round-off grows with its own displacement along it: a column carried
/// 2e6 m along its axis by its support (uncertainty ≈ 1e-3 of its geometric work) keeps
/// its two modes, at 2e8 m (≈ 9e-2) they are named, and a column beside an unloaded member
/// carried 2e8 m keeps them.
#[test]
fn the_3d_mode_check_follows_each_members_own_offset_along_it() {
    use dedaliano_engine::metamorphic::planes::{embed_2d, Plane};
    let model = |column_shift: f64, beside_shift: Option<f64>| {
        let mut v = json!({
            "nodes": {"0": {"id": 0, "x": 0.0, "z": 0.0}, "1": {"id": 1, "x": 0.0, "z": 2.0}, "2": {"id": 2, "x": 0.0, "z": 4.0}},
            "elements": {"1": {"id": 1, "type": "frame", "nodeI": 0, "nodeJ": 1, "materialId": 1, "sectionId": 1}, "2": {"id": 2, "type": "frame", "nodeI": 1, "nodeJ": 2, "materialId": 1, "sectionId": 1}},
            "supports": {"1": {"id": 1, "nodeId": 0, "type": "fixed", "dz": column_shift}},
            "loads": [{"type": "nodal", "data": {"nodeId": 2, "fx": 0.0, "fz": -100.0, "my": 0.0}}],
            "materials": {"1": {"id": 1, "e": 200000.0, "nu": 0.3}},
            "sections": {"1": {"id": 1, "a": 0.01, "iz": 1e-4}}
        });
        if let Some(shift) = beside_shift {
            v["nodes"]["20"] = json!({"id": 20, "x": 10.0, "z": 0.0});
            v["nodes"]["21"] = json!({"id": 21, "x": 12.0, "z": 0.0});
            v["elements"]["20"] = json!({"id": 20, "type": "frame", "nodeI": 20, "nodeJ": 21, "materialId": 1, "sectionId": 1});
            v["supports"]["2"] = json!({"id": 2, "nodeId": 20, "type": "fixed", "dx": shift});
        }
        s2(v)
    };
    let euler = std::f64::consts::PI.powi(2) * 200e6 * 1e-4 / (4.0 * 16.0) / 100.0;
    for plane in Plane::ALL {
        for (column_shift, beside, named) in [(2e6, None, false), (2e8, None, true), (0.0, Some(2e8), false)] {
            let b = dedaliano_engine::solver::buckling::solve_buckling_3d(&embed_2d(&model(column_shift, beside), plane).unwrap(), 2).unwrap();
            let at = format!("{plane:?} column {column_shift} m, beside {beside:?}");
            let flagged = b.structured_diagnostics.iter().find(|d| d.phase.as_deref() == Some("BU-UNRESOLVED-MODE"));
            assert!((b.modes[0].load_factor / euler - 1.0).abs() < 1e-2, "{at}: λ = {}", b.modes[0].load_factor);
            for k in 0..b.modes.len() {
                assert_eq!(flagged.is_some_and(|d| d.message.contains(&format!("mode {} (", k + 1))), named, "{at}, mode {}: {flagged:?}", k + 1);
            }
            if named {
                assert_eq!(flagged.unwrap().element_ids, Vec::<usize>::new(), "{at}: no member is within round-off of zero");
            }
        }
    }
}
