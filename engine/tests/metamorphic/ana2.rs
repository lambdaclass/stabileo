//! Every 2D analysis, reduced to a `Resp`.

use crate::case::{pad_2d, Case2};
use crate::response::{disp_2d, static_2d, Dim, Kind, Resp};
use dedaliano_engine::element::fiber_beam::{Fiber, FiberMaterial, FiberSectionDef};
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

fn mat_e(s: &SolverInput, sec: usize) -> f64 {
    s.elements.values().find(|e| e.section_id == sec).map_or(200_000.0, |e| s.materials[&e.material_id.to_string()].e)
}

fn rect_fibers(b: f64, h: f64, ny: usize, nz: usize, e: f64) -> FiberSectionDef {
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

fn staged_input(s: &SolverInput, stages: Vec<ConstructionStage>) -> Result<StagedInput, String> {
    let inp = StagedInput {
        nodes: s.nodes.clone(), materials: s.materials.clone(), sections: s.sections.clone(), elements: s.elements.clone(),
        supports: s.supports.clone(), loads: s.loads.clone(), constraints: s.constraints.clone(), stages,
    };
    let mut v = serde_json::to_value(&inp).map_err(|e| e.to_string())?;
    v["connectors"] = serde_json::to_value(&s.connectors).map_err(|e| e.to_string())?;
    staged::parse_staged_2d(&v.to_string())
}

fn stage(name: &str, s: &SolverInput, loads: Vec<usize>, all: bool) -> ConstructionStage {
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
    let mut o = Resp::default();
    o.scalar("total_mass", Dim::MASS, r.total_mass);
    let mut cum = [0.0; 3];
    for (k, m) in r.modes.iter().enumerate() {
        o.scalar(&format!("f{k:02}"), Dim::FREQ, m.frequency);
        // Effective-mass vector g = sign(Γ)·√m_eff per direction, tensor g·gᵀ.
        let g = [m.participation_x.signum() * m.effective_mass_x.max(0.0).sqrt(), m.participation_y.signum() * m.effective_mass_y.max(0.0).sqrt()];
        cum[0] += g[0] * g[0];
        cum[1] += g[0] * g[1];
        cum[2] += g[1] * g[1];
        // Modes inside a cluster can mix; compare cumulative sums only at
        // well-separated boundaries.
        // The last computed mode may be one of a repeated pair whose partner
        // was not computed: only boundaries with a known gap above.
        let sep = r.modes.get(k + 1).is_some_and(|n| n.frequency > m.frequency * (1.0 + 1e-3));
        if sep {
            o.push(None, None, &format!("meff{k:02}"), Kind::T2(Dim::MASS), cum.to_vec());
            o.set_floor(&format!("meff{k:02}"), r.total_mass);
        }
    }
    o
}

pub fn rows() -> Vec<Ana2> {
    vec![
        Ana2 { name: "linear", law: Law::Linear, axis_bound: false, iter_tol: 0.0, full_static: true, run: |c| Ok(static_2d(&linear::solve_2d(&c.s)?)) },
        Ana2 {
            name: "linear (dense reference)",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: true,
            run: |c| Ok(static_2d(&linear::prepare_static_2d_dense_reference(&c.s)?.solve_loads(&c.s.loads)?)),
        },
        Ana2 {
            name: "linear (sparse path)",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: true,
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
            run: |c| Ok(static_2d(&constraints::solve_constrained_2d(&constraints::ConstrainedInput { solver: c.s.clone(), constraints: c.s.constraints.clone() })?)),
        },
        Ana2 {
            name: "certified linear",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: true,
            run: |c| Ok(static_2d(&dedaliano_engine::certify::solver::certify_linear_2d_full(&c.s)?.results)),
        },
        Ana2 {
            name: "load combinations",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: true,
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
            run: |c| Ok(static_2d(&winkler::solve_winkler_2d(&winkler::WinklerInput { solver: c.s.clone(), foundation_springs: vec![] })?)),
        },
        Ana2 {
            name: "contact (no gaps)",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 1e-8,
            full_static: false,
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
            run: |c| Ok(static_2d(&conv(ssi::solve_ssi_2d(&ssi::SSIInput { solver: c.s.clone(), soil_springs: vec![], max_iter: 50, tolerance: 1e-10 }).map(|r| (r.converged, r.results)))?)),
        },
        Ana2 {
            name: "creep & shrinkage (t = t0)",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: false,
            run: |c| {
                let inp = creep_shrinkage::CreepShrinkageInput {
                    solver: c.s.clone(), creep_params: HashMap::new(),
                    time_steps: vec![creep_shrinkage::TimeStep { t_days: 28.0, additional_loads: vec![] }], aging_coefficient: 0.8,
                };
                let r = creep_shrinkage::solve_creep_shrinkage_2d(&inp)?;
                let mut o = Resp::default();
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
            run: |c| Ok(static_2d(&conv(pdelta::solve_pdelta_2d(&c.s, 100, 1e-12).map(|r| (r.converged, r.results)))?)),
        },
        Ana2 {
            name: "corotational",
            law: Law::Nonlinear,
            axis_bound: false,
            iter_tol: 1e-9,
            full_static: false,
            run: |c| Ok(static_2d(&conv(corotational::solve_corotational_2d(&c.s, 100, 1e-10, 4, false).map(|r| (r.converged, r.results)))?)),
        },
        Ana2 {
            name: "material nonlinear",
            law: Law::Nonlinear,
            axis_bound: false,
            iter_tol: 1e-9,
            full_static: false,
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
            run: |c| Ok(static_2d(&conv(cable::solve_cable_2d(&c.s, &c.dens, 100, 1e-10).map(|r| (r.converged, r.results)))?)),
        },
        Ana2 {
            name: "modal",
            law: Law::Indep,
            axis_bound: false,
            iter_tol: 1e-10,
            full_static: false,
            run: |c| Ok(modal_resp(&modal::solve_modal_2d(&c.s, &c.dens, 6)?)),
        },
        Ana2 {
            name: "certified modal",
            law: Law::Indep,
            axis_bound: false,
            iter_tol: 1e-10,
            full_static: false,
            run: |c| Ok(modal_resp(&dedaliano_engine::certify::modal::certify_modal_2d(&c.s, &c.dens, 6)?.results)),
        },
        Ana2 {
            name: "buckling",
            law: Law::Inverse,
            axis_bound: false,
            iter_tol: 1e-10,
            full_static: false,
            run: |c| {
                let r = buckling::solve_buckling_2d(&c.s, 3)?;
                let mut o = Resp::default();
                for (k, m) in r.modes.iter().enumerate() {
                    o.scalar(&format!("lambda{k}"), Dim::NONE, m.load_factor);
                }
                Ok(o)
            },
        },
        Ana2 {
            name: "time history",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: false,
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
            run: |c| {
                let md = modal::solve_modal_2d(&c.s, &c.dens, 4)?;
                let modes = md
                    .modes
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
                Ok(o)
            },
        },
        Ana2 {
            name: "harmonic",
            law: Law::Linear,
            axis_bound: false,
            iter_tol: 1e-10,
            full_static: false,
            run: |c| {
                let node = *c.probes.first().ok_or("no probe node")?;
                let mut comps = Vec::new();
                for dof in ["x", "y"] {
                    let inp = harmonic::HarmonicInput {
                        solver: c.s.clone(), densities: c.dens.clone(), frequencies: c.p.freqs.clone(), damping_ratio: 0.05,
                        response_node_id: node, response_dof: dof.into(),
                    };
                    comps.push(harmonic::solve_harmonic_2d(&inp)?);
                }
                let mut o = Resp::default();
                // Natural size: the largest static displacement (the ω = 0 response).
                let us = linear::solve_2d(&c.s).map(|r| r.displacements.iter().fold(0.0f64, |m, d| m.max(d.ux.abs()).max(d.uz.abs()))).unwrap_or(0.0);
                for k in 0..c.p.freqs.len() {
                    let (a, b) = (&comps[0].response_points[k], &comps[1].response_points[k]);
                    o.push(Some(node), None, &format!("H_re{k}"), Kind::V2(Dim::LEN), vec![a.real, b.real]);
                    o.push(Some(node), None, &format!("H_im{k}"), Kind::V2(Dim::LEN), vec![a.imag, b.imag]);
                    o.set_floor(&format!("H_re{k}"), us);
                    o.set_floor(&format!("H_im{k}"), us);
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
            run: |c| {
                let sections = c
                    .s
                    .sections
                    .values()
                    .map(|x| {
                        let (b, h) = rect(x.a, x.iz);
                        let mat = c.s.elements.values().find(|e| e.section_id == x.id).map_or(1, |e| e.material_id);
                        (x.id.to_string(), PlasticSectionData { a: x.a, iz: x.iz, material_id: mat, b: Some(b), h: Some(h) })
                    })
                    .collect();
                let materials = c.s.materials.values().map(|x| (x.id.to_string(), PlasticMaterialData { fy: Some(c.p.fy) })).collect();
                let r = plastic::solve_plastic_2d(&PlasticInput { solver: c.s.clone(), sections, materials, max_hinges: None, mp_overrides: None })?;
                let mut o = Resp::default();
                o.scalar("collapse_factor", Dim::NONE, r.collapse_factor);
                Ok(o)
            },
        },
        Ana2 {
            name: "kinematic check",
            law: Law::Indep,
            axis_bound: false,
            iter_tol: 0.0,
            full_static: false,
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
            run: |c| {
                let path = c.path.as_ref().ok_or("no deck path")?;
                let inp = influence::InfluenceLineInput {
                    solver: c.s.clone(), quantity: "M".into(), target_node_id: None, target_element_id: Some(path[1]),
                    target_position: 0.5, n_points_per_element: 4,
                };
                let r = influence::compute_influence_line(&inp)?;
                let mut o = Resp::default();
                for p in r.points.iter().filter(|p| path.contains(&p.element_id)) {
                    // Ordinate of M per unit load: a length.
                    o.push(None, Some(p.element_id), &format!("IL_t{:04}", (p.t * 1000.0).round() as i64), Kind::Local(Dim::LEN, true), vec![p.value]);
                }
                Ok(o)
            },
        },
    ]
}
