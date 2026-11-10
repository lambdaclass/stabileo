//! Every 2D analysis, reduced to a `Resp`.

use crate::case::{pad_2d, Case2};
use crate::response::{disp_2d, static_2d, Dim, Kind, Resp};
use dedaliano_engine::element::fiber_beam::{Fiber, FiberMaterial, FiberSectionDef};
use dedaliano_engine::load_session::{LoadSession2D, LoadSession3D};
use dedaliano_engine::metamorphic::planes::{pull_static, Plane};
use dedaliano_engine::postprocess::influence;
use dedaliano_engine::solver::{
    buckling, cable, constraints, contact, corotational, creep_shrinkage, fiber_nonlinear, harmonic, kinematic, linear, load_cases,
    material_nonlinear, modal, moving_loads, pdelta, plastic, spectral, ssi, staged, time_integration, winkler,
};
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// How the response depends on the model's static loads.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Law {
    /// Linear in the loads (superposition, reciprocity, energy apply).
    Linear,
    /// A load factor: loads × k ⇒ result / k.
    Inverse,
    /// Does not read the static loads.
    Indep,
    /// Nonlinear in the loads.
    Nonlinear,
}

pub struct Ana2 {
    pub name: &'static str,
    pub law: Law,
    /// Reads a fixed global direction (gravity, a spectrum direction): only
    /// motions that keep it (mirror about a vertical line, translations).
    pub axis_bound: bool,
    /// Relative convergence tolerance of an iterative solve (0 = direct).
    pub iter_tol: f64,
    /// Whether the static response carries the full results (energy check).
    pub full_static: bool,
    pub run: fn(&Case2) -> Result<Resp, String>,
    /// The 3D analysis the same plane frame, placed in a coordinate plane, must agree with, read
    /// back in the frame's axes. Tags starting with "stray " must be zero.
    pub planar: Option<fn(&Case2, Plane, &SolverInput3D) -> Result<Resp, String>>,
}

pub fn conv<T>(r: Result<(bool, T), String>) -> Result<T, String> {
    match r? {
        (true, t) => Ok(t),
        (false, _) => Err("did not converge".into()),
    }
}

/// Equivalent rectangle of a section (A = b·h, I = b·h³/12).
pub fn rect(a: f64, i: f64) -> (f64, f64) {
    let h = (12.0 * i / a).sqrt();
    (a / h, h)
}

pub(crate) fn section_material(
    materials: &std::collections::HashMap<String, SolverMaterial>,
    ids: impl Iterator<Item = usize>,
) -> Option<&SolverMaterial> {
    ids.map(|id| &materials[&id.to_string()]).max_by(|a, b| a.e.total_cmp(&b.e).then(a.nu.total_cmp(&b.nu)))
}

pub(crate) fn mat_e(s: &SolverInput, sec: usize) -> f64 {
    section_material(&s.materials, s.elements.values().filter(|e| e.section_id == sec).map(|e| e.material_id)).map_or(200_000.0, |m| m.e)
}

pub(crate) fn rect_fibers(b: f64, h: f64, ny: usize, nz: usize, e: f64) -> FiberSectionDef {
    let mut fibers = Vec::new();
    for i in 0..ny {
        for j in 0..nz {
            let y = -h / 2.0 + (i as f64 + 0.5) * h / ny as f64;
            let z = -b / 2.0 + (j as f64 + 0.5) * b / nz as f64;
            fibers.push(Fiber { y, z, area: b * h / (ny * nz) as f64, material_idx: 0 });
        }
    }
    FiberSectionDef { fibers, materials: vec![FiberMaterial::Elastic { e }] }
}

pub fn nodal_loads_2d(s: &SolverInput) -> Vec<SolverNodalLoad> {
    s.loads.iter().filter_map(|l| if let SolverLoad::Nodal(n) = l { Some(n.clone()) } else { None }).collect()
}

pub(crate) fn staged_input(s: &SolverInput, stages: Vec<ConstructionStage>) -> Result<StagedInput, String> {
    let inp = StagedInput {
        nodes: s.nodes.clone(), materials: s.materials.clone(), sections: s.sections.clone(), elements: s.elements.clone(),
        supports: s.supports.clone(), loads: s.loads.clone(), constraints: s.constraints.clone(), stages,
    };
    let mut v = serde_json::to_value(&inp).map_err(|e| e.to_string())?;
    v["connectors"] = serde_json::to_value(&s.connectors).map_err(|e| e.to_string())?;
    staged::parse_staged_2d(&v.to_string())
}

pub(crate) fn stage(name: &str, s: &SolverInput, loads: Vec<usize>, all: bool) -> ConstructionStage {
    ConstructionStage {
        name: name.into(),
        elements_added: if all { s.elements.values().map(|e| e.id).collect() } else { vec![] },
        elements_removed: vec![],
        load_indices: loads,
        supports_added: if all { s.supports.values().map(|x| x.id).collect() } else { vec![] },
        supports_removed: vec![],
        prestress_loads: vec![],
    }
}

pub fn modal_resp(r: &modal::ModalResult) -> Resp {
    let modes: Vec<_> = r.modes.iter().map(|m| (m.frequency, [m.participation_x, m.participation_y], [m.effective_mass_x, m.effective_mass_y])).collect();
    planar_modal_resp(r.total_mass, &modes)
}

/// (frequency, participation, effective mass), each along the frame's x and z.
fn planar_modal_resp(total_mass: f64, modes: &[(f64, [f64; 2], [f64; 2])]) -> Resp {
    let mut o = Resp::default();
    o.scalar("total_mass", Dim::MASS, total_mass);
    let mut cum = [0.0; 3];
    for (k, &(frequency, p, me)) in modes.iter().enumerate() {
        o.scalar(&format!("f{k:02}"), Dim::FREQ, frequency);
        // Effective-mass vector g = sign(Γ)·√m_eff per direction, tensor g·gᵀ.
        let g = [p[0].signum() * me[0].max(0.0).sqrt(), p[1].signum() * me[1].max(0.0).sqrt()];
        cum[0] += g[0] * g[0];
        cum[1] += g[0] * g[1];
        cum[2] += g[1] * g[1];
        // The last computed mode may be one of a repeated pair whose partner
        // was not computed: only boundaries with a known gap above.
        let sep = modes.get(k + 1).is_some_and(|n| crate::response::modal_gap(frequency, n.0));
        if sep {
            o.push(None, None, &format!("meff{k:02}"), Kind::T2(Dim::MASS), cum.to_vec());
            o.set_floor(&format!("meff{k:02}"), total_mass * crate::response::eigen_gap_factor(frequency, modes[k + 1].0));
        }
    }
    o
}

fn along(v: [f64; 3], axis: [f64; 3]) -> f64 {
    v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2]
}

pub(crate) fn modal_in_plane(plane: Plane, r: &modal::ModalResult3D) -> Result<Resp, String> {
    let finite = r.total_mass.is_finite()
        && r.modes.iter().all(|m| {
            [m.frequency, m.participation_x, m.participation_y, m.participation_z, m.effective_mass_x, m.effective_mass_y, m.effective_mass_z].iter().all(|v| v.is_finite())
        });
    if !finite {
        return Err("the 3D modal result is not finite".into());
    }
    let (e1, e2, n) = (plane.e1(), plane.e2(), plane.normal());
    let modes: Vec<_> = r
        .modes
        .iter()
        .map(|m| {
            let (p, me) = ([m.participation_x, m.participation_y, m.participation_z], [m.effective_mass_x, m.effective_mass_y, m.effective_mass_z]);
            (m.frequency, [along(p, e1), along(p, e2)], [along(me, e1), along(me, e2)])
        })
        .collect();
    let mut o = planar_modal_resp(r.total_mass, &modes);
    let stray = r.modes.iter().map(|m| along([m.effective_mass_x, m.effective_mass_y, m.effective_mass_z], n).abs()).fold(0.0, f64::max);
    o.scalar("stray mass", Dim::MASS, stray);
    Ok(o)
}

pub(crate) fn in_plane(c: &Case2, plane: Plane, r: Result<AnalysisResults3D, String>) -> Result<Resp, String> {
    Ok(crate::response::planar_static(&pull_static(&c.s, plane, &r?).map_err(|e| e.to_string())?))
}

fn load_factors(f: impl Iterator<Item = f64>) -> Resp {
    let mut o = Resp::default();
    for (k, l) in f.enumerate() {
        o.scalar(&format!("lambda{k}"), Dim::NONE, l);
    }
    o
}

pub fn rows() -> Vec<Ana2> {
    vec![
        Ana2 { name: "linear", law: Law::Linear, axis_bound: false, iter_tol: 0.0, full_static: true, run: |c| Ok(static_2d(&linear::solve_2d(&c.s)?)), planar: Some(|c, p, s| in_plane(c, p, linear::solve_3d(s))) },
        Ana2 {
            name: "linear (WASM typed path)",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: true,
            planar: Some(|c, p, s| in_plane(c, p, linear::solve_3d(s))),
            run: |c| {
                let typed: dedaliano_engine::types::units::ElasticInput2D = serde_json::to_value(&c.s).and_then(serde_json::from_value).map_err(|e| e.to_string())?;
                Ok(static_2d(&linear::solve_2d_typed(&typed)?))
            },
        },
        Ana2 {
            name: "linear (load session)",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: true,
            planar: Some(|c, p, s| in_plane(c, p, LoadSession3D::from_input(s.clone()).and_then(|x| x.solve_loads(&s.loads)))),
            run: |c| Ok(static_2d(&LoadSession2D::from_input(c.s.clone())?.solve_loads(&c.s.loads)?)),
        },
        Ana2 {
            name: "linear (dense reference)",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: true,
            planar: None,
            run: |c| Ok(static_2d(&linear::prepare_static_2d_dense_reference(&c.s)?.solve_loads(&c.s.loads)?)),
        },
        Ana2 {
            name: "linear (sparse path)",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: true,
            planar: None,
            run: |c| {
                let (p, n, e) = pad_2d(&c.s);
                let mut r = static_2d(&linear::solve_2d(&p)?);
                r.retain_ids(&n, &e);
                Ok(r)
            },
        },
        Ana2 {
            name: "linear (PCG)",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 1e-10,
            full_static: true,
            planar: None,
            run: |c| {
                let (mut p, n, e) = pad_2d(&c.s);
                p.solver_options = Some(SolverOptions { method: Some("pcg".into()), preconditioner: None, tolerance: Some(1e-12), max_iterations: Some(100_000) });
                let mut r = static_2d(&linear::solve_2d(&p)?);
                r.retain_ids(&n, &e);
                Ok(r)
            },
        },
        Ana2 {
            name: "constrained",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: true,
            planar: None,
            run: |c| Ok(static_2d(&constraints::solve_constrained_2d(&constraints::ConstrainedInput { solver: c.s.clone(), constraints: c.s.constraints.clone() })?)),
        },
        Ana2 {
            name: "certified linear",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: true,
            planar: Some(|c, p, s| in_plane(c, p, dedaliano_engine::certify::certify_linear_3d_full(s).map(|r| r.results))),
            run: |c| Ok(static_2d(&dedaliano_engine::certify::certify_linear_2d_full(&c.s)?.results)),
        },
        Ana2 {
            name: "load combinations",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: true,
            planar: None,
            run: |c| {
                // Two cases (even / odd loads) combined 1.0·A + 1.0·B.
                let mut s = c.s.clone();
                let loads = std::mem::take(&mut s.loads);
                let (a, b): (Vec<_>, Vec<_>) = loads.into_iter().enumerate().partition(|(k, _)| k % 2 == 0);
                let inp = load_cases::MultiCaseInput {
                    solver: s,
                    load_cases: vec![
                        load_cases::LoadCase { name: "A".into(), loads: a.into_iter().map(|x| x.1).collect() },
                        load_cases::LoadCase { name: "B".into(), loads: b.into_iter().map(|x| x.1).collect() },
                    ],
                    combinations: vec![load_cases::CombinationDef { name: "C".into(), factors: [("A".to_string(), 1.0), ("B".to_string(), 1.0)].into() }],
                };
                Ok(static_2d(&load_cases::solve_multi_case_2d(&inp)?.combination_results[0].results))
            },
        },
        Ana2 {
            name: "staged (one stage)",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: true,
            planar: None,
            run: |c| {
                let st = stage("all", &c.s, (0..c.s.loads.len()).collect(), true);
                Ok(static_2d(&staged::solve_staged_2d(&staged_input(&c.s, vec![st])?)?.final_results))
            },
        },
        Ana2 {
            name: "staged (loads in two stages)",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: false,
            planar: None,
            run: |c| {
                let n = c.s.loads.len();
                let s1 = stage("1", &c.s, (0..n).filter(|k| k % 2 == 0).collect(), true);
                let s2 = stage("2", &c.s, (0..n).filter(|k| k % 2 == 1).collect(), false);
                Ok(disp_2d(&staged::solve_staged_2d(&staged_input(&c.s, vec![s1, s2])?)?.final_results))
            },
        },
        Ana2 {
            name: "Winkler (no foundation)",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: true,
            planar: None,
            run: |c| Ok(static_2d(&winkler::solve_winkler_2d(&winkler::WinklerInput { solver: c.s.clone(), foundation_springs: vec![] })?)),
        },
        Ana2 {
            name: "contact (no gaps)",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 1e-8,
            full_static: false,
            planar: None,
            run: |c| {
                let inp: contact::ContactInput = serde_json::from_value(serde_json::json!({ "solver": c.s })).map_err(|e| e.to_string())?;
                Ok(static_2d(&conv(contact::solve_contact_2d(&inp).map(|r| (r.converged, r.results)))?))
            },
        },
        Ana2 {
            name: "SSI (no soil springs)",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 1e-8,
            full_static: false,
            planar: None,
            run: |c| Ok(static_2d(&conv(ssi::solve_ssi_2d(&ssi::SSIInput { solver: c.s.clone(), soil_springs: vec![], max_iter: 50, tolerance: 1e-10 }).map(|r| (r.converged, r.results)))?)),
        },
        Ana2 {
            name: "creep & shrinkage (t = t0)",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: false,
            planar: None,
            run: |c| {
                let inp = creep_shrinkage::CreepShrinkageInput {
                    solver: c.s.clone(), creep_params: HashMap::new(),
                    time_steps: vec![creep_shrinkage::TimeStep { t_days: 28.0, additional_loads: vec![] }], aging_coefficient: 0.8,
                };
                let r = creep_shrinkage::solve_creep_shrinkage_2d(&inp)?;
                let mut o = Resp::default();
                o.2 = crate::response::NearMechanism::of(&r.structured_diagnostics);
                for d in &r.steps[0].displacements {
                    o.push(Some(d.node_id), None, "u", Kind::V2(Dim::LEN), vec![d.ux, d.uz]);
                    o.push(Some(d.node_id), None, "ry", Kind::P2(Dim::NONE), vec![d.ry]);
                }
                Ok(o)
            },
        },
        Ana2 {
            name: "P-Delta",
            law: Law::Nonlinear,
            axis_bound: false,
            iter_tol: 1e-10,
            full_static: false,
            planar: Some(|c, p, s| in_plane(c, p, converged_finite(pdelta::solve_pdelta_3d(s, 100, 1e-12).map(|r| (r.converged, r.results)), finite_3d))),
            run: |c| Ok(static_2d(&converged_finite(pdelta::solve_pdelta_2d(&c.s, 100, 1e-12).map(|r| (r.converged, r.results)), finite_2d)?)),
        },
        Ana2 {
            name: "corotational",
            law: Law::Nonlinear,
            axis_bound: false,
            iter_tol: 1e-9,
            full_static: false,
            planar: None,
            run: |c| Ok(static_2d(&conv(corotational::solve_corotational_2d(&c.s, 100, 1e-10, 4, false).map(|r| (r.converged, r.results)))?)),
        },
        Ana2 {
            name: "material nonlinear",
            law: Law::Nonlinear,
            axis_bound: false,
            iter_tol: 1e-9,
            full_static: false,
            planar: None,
            run: |c| {
                let fy = c.p.fy * 1000.0; // MPa → kN/m²
                let inp = NonlinearMaterialInput {
                    solver: c.s.clone(),
                    material_models: c.s.materials.values().map(|x| (x.id.to_string(), MaterialModel { model_type: "elastic_perfectly_plastic".into(), fy: c.p.fy, alpha: None })).collect(),
                    section_capacities: c
                        .s
                        .sections
                        .values()
                        .map(|x| {
                            let (b, h) = rect(x.a, x.iz);
                            (x.id.to_string(), SectionCapacity { np: fy * x.a, mp: fy * b * h * h / 4.0, zp: None })
                        })
                        .collect(),
                    max_iter: 60,
                    tolerance: 1e-10,
                    n_increments: 4,
                };
                let r = conv(material_nonlinear::solve_nonlinear_material_2d(&inp).map(|r| (r.converged, r.results)))?;
                if !r.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::KnownIssue && d.phase.as_deref() == Some("NL-5") && d.value == Some(428.0)) {
                    return Err("missing containment warning safety #428".into());
                }
                Ok(static_2d(&r))
            },
        },
        Ana2 {
            name: "fiber nonlinear",
            law: Law::Nonlinear,
            axis_bound: false,
            iter_tol: 1e-9,
            full_static: false,
            planar: None,
            run: |c| {
                let sections = c
                    .s
                    .sections
                    .values()
                    .map(|x| {
                        let (b, h) = rect(x.a, x.iz);
                        (x.id.to_string(), rect_fibers(b, h, 40, 1, mat_e(&c.s, x.id)))
                    })
                    .collect();
                let inp = fiber_nonlinear::FiberNonlinearInput {
                    solver: c.s.clone(), fiber_sections: sections, n_integration_points: 5, max_iter: 60, tolerance: 1e-10, n_increments: 2, modified_nr: false,
                };
                Ok(static_2d(&conv(fiber_nonlinear::solve_fiber_nonlinear_2d(&inp).map(|r| (r.converged, r.results)))?))
            },
        },
        Ana2 {
            name: "cable solver",
            law: Law::Nonlinear,
            axis_bound: true,
            iter_tol: 1e-9,
            full_static: false,
            planar: None,
            run: |c| Ok(static_2d(&conv(cable::solve_cable_2d(&c.s, &c.dens, 100, 1e-10).map(|r| (r.converged, r.results)))?)),
        },
        Ana2 {
            name: "modal",
            law: Law::Indep,
            axis_bound: false,
            iter_tol: 1e-10,
            full_static: false,
            planar: Some(|c, p, s| modal_in_plane(p, &modal::solve_modal_3d(s, &c.dens, 6)?)),
            run: |c| Ok(modal_resp(&modal::solve_modal_2d(&c.s, &c.dens, 6)?)),
        },
        Ana2 {
            name: "certified modal",
            law: Law::Indep,
            axis_bound: false,
            iter_tol: 1e-10,
            full_static: false,
            planar: None,
            run: |c| Ok(modal_resp(&dedaliano_engine::certify::modal::certify_modal_2d(&c.s, &c.dens, 6)?.results)),
        },
        Ana2 {
            name: "buckling",
            law: Law::Inverse,
            axis_bound: false,
            iter_tol: 1e-10,
            full_static: false,
            planar: Some(|_, _, s| Ok(load_factors(buckling::solve_buckling_3d(s, 3)?.modes.iter().map(|m| m.load_factor)))),
            run: |c| Ok(load_factors(buckling::solve_buckling_2d(&c.s, 3)?.modes.iter().map(|m| m.load_factor))),
        },
        Ana2 {
            name: "time history",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 1e-10,
            full_static: false,
            planar: None,
            run: |c| {
                let loads = nodal_loads_2d(&c.s);
                let n_steps = 60;
                let inp = TimeHistoryInput {
                    solver: c.s.clone(), densities: c.dens.clone(), time_step: c.p.dt, n_steps, method: "newmark".into(),
                    beta: 0.25, gamma: 0.5, alpha: None, damping_xi: Some(0.05), ground_accel: None, ground_direction: None,
                    force_history: Some(vec![TimeForceRecord { time: 0.0, loads: loads.clone() }, TimeForceRecord { time: 1000.0 * c.p.dt, loads }]),
                };
                let r = time_integration::solve_time_history_2d(&inp)?;
                let mut o = Resp::default();
                o.2 = crate::response::NearMechanism::of(&r.structured_diagnostics);
                for h in &r.node_histories {
                    for k in (0..h.ux.len()).step_by(if crate::generated::strict() { 1 } else { 10 }) {
                        o.push(Some(h.node_id), None, &format!("u_t{k:03}"), Kind::V2(Dim::LEN), vec![h.ux[k], h.uz[k]]);
                        o.push(Some(h.node_id), None, &format!("ry_t{k:03}"), Kind::P2(Dim::NONE), vec![h.ry[k]]);
                    }
                }
                Ok(o)
            },
        },
        Ana2 {
            name: "spectral",
            law: Law::Indep,
            axis_bound: true,
            iter_tol: 1e-10,
            full_static: false,
            planar: None,
            run: |c| {
                // Never cut a repeated pair: a symmetric model's response would not be symmetric (#1030).
                let (md, n) = cluster_complete(|k| modal::solve_modal_2d(&c.s, &c.dens, k), |m| m.modes.iter().map(|x| x.omega).collect(), 4, 8, crate::dynamic_accuracy::of_2d(c).map_or(f64::INFINITY, |a| a.residual))?;
                let modes = md.modes[..n]
                    .iter()
                    .map(|x| SpectralModeInput {
                        frequency: x.frequency, period: x.period, omega: x.omega,
                        displacements: x.displacements.iter().map(|d| SpectralModeDisp { node_id: d.node_id, ux: d.ux, uz: d.uz, ry: d.ry }).collect(),
                        participation_x: x.participation_x, participation_y: x.participation_y,
                        effective_mass_x: x.effective_mass_x, effective_mass_y: x.effective_mass_y,
                    })
                    .collect();
                // A spectrum that varies with period, so periods must scale.
                let pts = [(0.0, 0.2), (0.3, 0.5), (1.0, 0.5), (4.0, 0.12)];
                let inp = SpectralInput {
                    solver: c.s.clone(), modes, densities: c.dens.clone(),
                    spectrum: DesignSpectrum {
                        name: "s".into(),
                        points: pts.iter().map(|&(t, sa)| SpectrumPoint { period: t * c.p.dt / 0.002, sa }).collect(),
                        in_g: Some(true),
                    },
                    direction: "X".into(), rule: Some("CQC".into()), xi: Some(0.05), importance_factor: None, reduction_factor: None, total_mass: None,
                };
                let r = spectral::solve_spectral_2d(&inp)?;
                let mut o = Resp::default();
                o.2 = crate::response::NearMechanism::of(&r.structured_diagnostics);
                // Natural size: the first mode's spectral displacement Sa·g/ω².
                let sd = md.modes.first().map_or(0.0, |m| 0.5 * 9.81 / (m.omega * m.omega));
                for d in &r.displacements {
                    o.push(Some(d.node_id), None, "u", Kind::Abs2(Dim::LEN), vec![d.ux.abs(), d.uz.abs()]);
                    o.set_floor("u", sd);
                }
                for e in &r.element_forces {
                    o.push(None, Some(e.element_id), "N", Kind::Local(Dim::FORCE, false), vec![e.n_max.abs()]);
                    o.push(None, Some(e.element_id), "V", Kind::Local(Dim::FORCE, false), vec![e.v_max.abs()]);
                    o.push(None, Some(e.element_id), "M", Kind::Local(Dim::MOMENT, false), vec![e.m_max.abs()]);
                }
                o.scalar("base_shear", Dim::FORCE, r.base_shear);
                o.set_floor("base_shear", md.total_mass * pts.iter().fold(0.0f64, |m, p| m.max(p.1)) * 9.81);
                Ok(o)
            },
        },
        Ana2 {
            name: "harmonic",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 1e-10,
            full_static: false,
            planar: None,
            run: |c| {
                let node = *c.probes.first().ok_or("no probe node")?;
                let mut comps = Vec::new();
                for dof in ["x", "y"] {
                    let inp = harmonic::HarmonicInput {
                        solver: c.s.clone(), densities: c.dens.clone(), frequencies: c.p.freqs.clone(), damping_ratio: 0.05,
                        response_node_id: node, response_dof: dof.into(),
                    };
                    comps.push(harmonic::solve_harmonic_2d_with_damping(&inp)?);
                }
                let mut o = Resp::default();
                // Natural size: the largest static displacement (the ω = 0 response), a rotation as rotation × model size.
                let l = crate::case::extent(c.s.nodes.values().map(|n| [n.x, n.z, 0.0]));
                let us = linear::solve_2d(&c.s).map(|r| r.displacements.iter().fold(0.0f64, |m, d| m.max(d.ux.abs()).max(d.uz.abs()).max(d.ry.abs() * l))).unwrap_or(0.0);
                let cond = if c.p.symmetry { Some(dedaliano_engine::metamorphic::conditioning::of_2d(&c.s)?) } else { None };
                let rel = cond.as_ref().map_or(0.0, |cond| crate::checks2::rel_for("harmonic", 1e-10, cond));
                let accuracy = if c.p.symmetry { crate::dynamic_accuracy::of_2d(c).ok() } else { None };
                for k in 0..c.p.freqs.len() {
                    let floor = if !c.p.symmetry || crate::generated::strict() { us } else {
                        let direct = comps.iter().all(|r| r.0.method == harmonic::HarmonicMethod::Direct);
                        us.max(crate::dynamic_accuracy::harmonic_floor(if direct { accuracy.as_ref() } else { None }, c.p.freqs[k], comps[0].1, cond.as_ref().unwrap().rel(), rel))
                    };
                    let (a, b) = (&comps[0].0.response_points[k], &comps[1].0.response_points[k]);
                    o.push(Some(node), None, &format!("H_re{k}"), Kind::V2(Dim::LEN), vec![a.real, b.real]);
                    o.push(Some(node), None, &format!("H_im{k}"), Kind::V2(Dim::LEN), vec![a.imag, b.imag]);
                    o.set_floor(&format!("H_re{k}"), floor);
                    o.set_floor(&format!("H_im{k}"), floor);
                }
                Ok(o)
            },
        },
        Ana2 {
            name: "plastic collapse",
            law: Law::Inverse,
            axis_bound: false,
            iter_tol: 5e-8 /* event resolution TIE = 1e-6 (solver/plastic.rs) / 20 */,
            full_static: false,
            planar: None,
            run: |c| {
                let sections = c
                    .s
                    .sections
                    .values()
                    .map(|x| {
                        let (b, h) = rect(x.a, x.iz);
                        let mat = section_material(&c.s.materials, c.s.elements.values().filter(|e| e.section_id == x.id).map(|e| e.material_id)).map_or(1, |m| m.id);
                        (x.id.to_string(), PlasticSectionData { a: x.a, iz: x.iz, material_id: mat, b: Some(b), h: Some(h) })
                    })
                    .collect();
                let materials = c.s.materials.values().map(|x| (x.id.to_string(), PlasticMaterialData { fy: Some(c.p.fy) })).collect();
                let r = plastic::solve_plastic_2d(&PlasticInput { solver: c.s.clone(), sections, materials, max_hinges: None, mp_overrides: None })?;
                let mut o = Resp::default();
                o.scalar("collapse_factor", Dim::NONE, r.collapse_factor);
                if !r.is_mechanism {
                    o.scalar(crate::response::LOWER_BOUND, Dim::NONE, 1.0);
                }
                Ok(o)
            },
        },
        Ana2 {
            name: "kinematic check",
            law: Law::Indep,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: false,
            planar: None,
            run: |c| {
                let r = kinematic::analyze_kinematics_2d(&c.s);
                if let Some(e) = r.invalid_input {
                    return Err(e);
                }
                let mut o = Resp::default();
                o.scalar("mechanisms", Dim::NONE, r.mechanism_modes as f64);
                o.scalar("degree", Dim::NONE, r.degree as f64 + 1000.0);
                o.scalar("solvable", Dim::NONE, if r.is_solvable { 1.0 } else { 2.0 });
                Ok(o)
            },
        },
        Ana2 {
            name: "moving loads",
            law: Law::Nonlinear,
            axis_bound: true,
            iter_tol: 0.0,
            full_static: false,
            planar: None,
            run: |c| {
                let path = c.path.clone().ok_or("no deck path")?;
                let inp = MovingLoadInput {
                    solver: c.s.clone(),
                    train: LoadTrain { name: "two axles".into(), axles: vec![Axle { offset: 0.0, weight: c.p.axle }, Axle { offset: 3.0 * c.p.step, weight: 0.5 * c.p.axle }] },
                    step: Some(c.p.step),
                    path_element_ids: Some(path.clone()),
                };
                let r = moving_loads::solve_moving_loads_2d(&inp)?;
                let span: f64 = r.path.iter().map(|p| p.length).sum();
                let mut o = Resp::default();
                for (k, e) in &r.elements {
                    let id = Some(k.parse::<usize>().map_err(|e| e.to_string())?);
                    o.push(None, id, "M", Kind::Pair(Dim::MOMENT, true), vec![e.m_max_pos, e.m_max_neg]);
                    o.push(None, id, "V", Kind::Pair(Dim::FORCE, true), vec![e.v_max_pos, e.v_max_neg]);
                    o.push(None, id, "N", Kind::Pair(Dim::FORCE, false), vec![e.n_max_pos, e.n_max_neg]);
                }
                // Natural sizes: the axle weight and its moment over the span.
                o.set_floor("M", c.p.axle * span);
                o.set_floor("V", c.p.axle);
                o.set_floor("N", c.p.axle);
                Ok(o)
            },
        },
        Ana2 {
            name: "influence line",
            law: Law::Indep,
            axis_bound: true,
            iter_tol: 0.0,
            full_static: false,
            planar: None,
            run: |c| {
                let path = c.path.as_ref().ok_or("no deck path")?;
                let inp = influence::InfluenceLineInput {
                    solver: c.s.clone(), quantity: "M".into(), target_node_id: None, target_element_id: Some(path[1]),
                    target_position: 0.5, n_points_per_element: 4,
                };
                let r = influence::compute_influence_line(&inp)?;
                let mut o = Resp::default();
                o.2 = crate::response::NearMechanism::of(&r.structured_diagnostics);
                for p in r.points.iter().filter(|p| path.contains(&p.element_id)) {
                    // Ordinate of M per unit load: a length.
                    o.push(None, Some(p.element_id), &format!("IL_t{:04}", (p.t * 1000.0).round() as i64), Kind::Local(Dim::LEN, true), vec![p.value]);
                }
                Ok(o)
            },
        },
    ]
}

/// The first `first` modes, extended to the end of a nearly repeated cluster, asking the solver for
/// more modes until the cluster's end is seen; an unresolved cluster is an error, never a cut.
pub(crate) fn cluster_complete<M>(solve: impl Fn(usize) -> Result<M, String>, omegas: impl Fn(&M) -> Vec<f64>, first: usize, mut requested: usize, uncertainty: f64) -> Result<(M, usize), String> {
    loop {
        let md = solve(requested)?;
        let w = omegas(&md);
        let mut n = w.len().min(first);
        while n > 0 && n < w.len() && (w[n] - w[n - 1] <= 1e-3 * w[n] || w[n] * w[n] - w[n - 1] * w[n - 1] <= 2.0 * uncertainty) {
            n += 1;
        }
        if n < w.len() || w.len() < requested {
            return Ok((md, n));
        }
        if requested >= 64 {
            return Err(format!("repeated-mode cluster not resolved within {requested} modes"));
        }
        requested *= 2;
    }
}

#[test]
fn a_cluster_crossing_the_requested_modes_is_fetched_whole() {
    let spectrum: Vec<f64> = [1.0, 2.0, 3.0].into_iter().chain([4.0; 9]).chain((0..10).map(|k| 10.0 + k as f64)).collect();
    let asked = std::cell::RefCell::new(Vec::new());
    let solve = |k: usize| -> Result<Vec<f64>, String> { asked.borrow_mut().push(k); Ok(spectrum[..k.min(spectrum.len())].to_vec()) };
    let (modes, n) = cluster_complete(solve, |m: &Vec<f64>| m.clone(), 4, 8, 0.0).unwrap();
    assert_eq!(n, 12);
    assert_eq!(modes.len(), 16);
    assert_eq!(*asked.borrow(), vec![8, 16]);
    let flat = |k: usize| -> Result<Vec<f64>, String> { Ok(vec![1.0; k]) };
    assert!(cluster_complete(flat, |m: &Vec<f64>| m.clone(), 4, 8, 0.0).unwrap_err().contains("not resolved"));
}

/// A P-Delta result converged to 1e-12 within 100 steps, and finite in every reported number.
pub(crate) fn converged_finite<T>(r: Result<(bool, T), String>, finite: impl Fn(&T) -> bool) -> Result<T, String> {
    let r = conv(r)?;
    if finite(&r) { Ok(r) } else { Err("converged to a non-finite result".into()) }
}

pub(crate) fn finite_2d(r: &AnalysisResults) -> bool {
    r.displacements.iter().all(|d| [d.ux, d.uz, d.ry].iter().all(|v| v.is_finite()))
        && r.reactions.iter().all(|x| [x.rx, x.rz, x.my].iter().all(|v| v.is_finite()))
        && r.element_forces.iter().all(|f| [f.n_start, f.n_end, f.v_start, f.v_end, f.m_start, f.m_end].iter().all(|v| v.is_finite()))
}

pub(crate) fn finite_3d(r: &AnalysisResults3D) -> bool {
    r.displacements.iter().all(|d| [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz].iter().all(|v| v.is_finite()) && d.warping.is_none_or(f64::is_finite))
        && r.reactions.iter().all(|x| [x.fx, x.fy, x.fz, x.mx, x.my, x.mz].iter().all(|v| v.is_finite()))
        && r.element_forces.iter().all(|f| {
            [f.n_start, f.n_end, f.vy_start, f.vy_end, f.vz_start, f.vz_end, f.mx_start, f.mx_end, f.my_start, f.my_end, f.mz_start, f.mz_end]
                .iter()
                .all(|v| v.is_finite())
        })
}

#[test]
fn p_delta_rows_need_convergence_and_finite_numbers() {
    assert_eq!(converged_finite(Ok((true, 1.0)), |v: &f64| v.is_finite()), Ok(1.0));
    assert!(converged_finite(Ok((false, 1.0)), |v: &f64| v.is_finite()).is_err(), "an unconverged iterate is never used");
    assert!(converged_finite(Ok((true, f64::NAN)), |v: &f64| v.is_finite()).is_err());
    assert!(converged_finite::<f64>(Err("refused".into()), |v| v.is_finite()).is_err());
}

#[test]
fn a_non_finite_member_force_is_not_finite() {
    let s = crate::common::make_beam(2, 4.0, 200_000.0, 0.01, 1e-4, "fixed", None, vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -1.0, my: 0.0 })]);
    let mut r = dedaliano_engine::solver::linear::solve_2d(&s).unwrap();
    assert!(finite_2d(&r));
    r.element_forces[0].m_end = f64::NAN;
    assert!(!finite_2d(&r));
    let s3 = crate::common::make_3d_beam(2, 4.0, 200_000.0, 0.3, 0.01, 1e-4, 1e-4, 1e-5, vec![true; 6], None, vec![]);
    let mut r3 = dedaliano_engine::solver::linear::solve_3d(&s3).unwrap();
    assert!(finite_3d(&r3));
    r3.element_forces[0].mz_end = f64::INFINITY;
    assert!(!finite_3d(&r3));
    let mut warped = dedaliano_engine::solver::linear::solve_3d(&s3).unwrap();
    warped.displacements[0].warping = Some(f64::NAN);
    assert!(!finite_3d(&warped));
}
