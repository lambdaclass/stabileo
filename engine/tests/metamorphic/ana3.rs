//! Every 3D analysis, reduced to a `Resp`.

use crate::ana2::{conv, rect, Law};
use crate::case::{pad_3d, Case3};
use crate::response::{disp_3d, static_3d, Dim, Kind, Resp};
use dedaliano_engine::element::fiber_beam::{Fiber, FiberMaterial, FiberSectionDef};
use dedaliano_engine::postprocess::influence;
use dedaliano_engine::solver::{
    buckling, cable, constraints, contact, corotational, creep_shrinkage, fiber_nonlinear, harmonic, kinematic, linear, load_cases,
    material_nonlinear, modal, moving_loads, pdelta, plastic, spectral, ssi, staged, time_integration, winkler,
};
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// Which rigid motions an analysis admits.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Motion {
    /// Any rotation.
    Any,
    /// Rotations about global Z (the analysis has a built-in −Z gravity).
    AboutZ,
    /// Rotations mapping axes onto axes (a direction given as an axis name).
    AxisPerm,
}

pub struct Ana3 {
    pub name: &'static str,
    pub law: Law,
    pub motion: Motion,
    pub iter_tol: f64,
    pub full_static: bool,
    pub run: fn(&Case3) -> Result<Resp, String>,
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

pub fn nodal_loads_3d(s: &SolverInput3D) -> Vec<SolverNodalLoad3D> {
    s.loads.iter().filter_map(|l| if let SolverLoad3D::Nodal(n) = l { Some(n.clone()) } else { None }).collect()
}

/// Rectangle (b along local z, h along local y) bending about local z with
/// I_z, and its width from I_y: h = √(12 I_z / A), b = √(12 I_y / A).
fn rect3(s: &SolverSection3D) -> (f64, f64) {
    ((12.0 * s.iy / s.a).sqrt(), (12.0 * s.iz / s.a).sqrt())
}

pub fn modal_resp_3d(r: &modal::ModalResult3D) -> Resp {
    let mut o = Resp::default();
    o.scalar("total_mass", Dim::MASS, r.total_mass);
    let mut cum = [0.0; 6];
    for (k, m) in r.modes.iter().enumerate() {
        o.scalar(&format!("f{k:02}"), Dim::FREQ, m.frequency);
        let g = [
            m.participation_x.signum() * m.effective_mass_x.max(0.0).sqrt(),
            m.participation_y.signum() * m.effective_mass_y.max(0.0).sqrt(),
            m.participation_z.signum() * m.effective_mass_z.max(0.0).sqrt(),
        ];
        let t = [g[0] * g[0], g[0] * g[1], g[0] * g[2], g[1] * g[1], g[1] * g[2], g[2] * g[2]];
        for i in 0..6 {
            cum[i] += t[i];
        }
        // Only boundaries with a known gap above (see the 2D version).
        if r.modes.get(k + 1).is_some_and(|n| n.frequency > m.frequency * (1.0 + 1e-3)) {
            o.push(None, None, &format!("meff{k:02}"), Kind::T3(Dim::MASS), cum.to_vec());
            o.set_floor(&format!("meff{k:02}"), r.total_mass);
        }
    }
    o
}

fn staged_3d(s: &SolverInput3D, stages: serde_json::Value) -> Result<StagedAnalysisResults3D, String> {
    let mut v = serde_json::json!({
        "nodes": s.nodes, "materials": s.materials, "sections": s.sections, "elements": s.elements,
        "supports": s.supports, "loads": s.loads, "constraints": s.constraints,
        "plates": s.plates, "quads": s.quads, "quad9s": s.quad9s,
        "solidShells": s.solid_shells, "curvedShells": s.curved_shells, "curvedBeams": s.curved_beams, "connectors": s.connectors,
        "leftHand": s.left_hand,
    });
    v["stages"] = stages;
    staged::solve_staged_3d(&staged::parse_staged_3d(&v.to_string())?)
}

fn stage_all(s: &SolverInput3D, loads: Vec<usize>) -> serde_json::Value {
    // 3D stages name supports by node id (as the app does).
    let sup: Vec<usize> = s.supports.values().map(|x| x.node_id).collect();
    serde_json::json!({
        "name": "all",
        "elementsAdded": s.elements.values().map(|e| e.id).collect::<Vec<_>>(),
        "loadIndices": loads,
        "supportsAdded": sup,
        "platesAdded": s.plates.values().map(|e| e.id).collect::<Vec<_>>(),
        "quadsAdded": s.quads.values().map(|e| e.id).collect::<Vec<_>>(),
    })
}

pub fn rows() -> Vec<Ana3> {
    vec![
        Ana3 { name: "linear", law: Law::Linear, motion: Motion::Any, iter_tol: 0.0, full_static: true, run: |c| Ok(static_3d(&linear::solve_3d(&c.s)?)) },
        Ana3 {
            name: "linear (sparse path)",
            law: Law::Linear,
            motion: Motion::Any,
            iter_tol: 0.0,
            full_static: true,
            run: |c| {
                let (p, n, e) = pad_3d(&c.s);
                let mut r = static_3d(&linear::solve_3d(&p)?);
                r.retain_ids(&n, &e);
                Ok(r)
            },
        },
        Ana3 {
            name: "linear (PCG)",
            law: Law::Linear,
            motion: Motion::Any,
            iter_tol: 1e-10,
            full_static: true,
            run: |c| {
                let (mut p, n, e) = pad_3d(&c.s);
                p.solver_options = Some(SolverOptions { method: Some("pcg".into()), preconditioner: None, tolerance: Some(1e-12), max_iterations: Some(100_000) });
                let mut r = static_3d(&linear::solve_3d(&p)?);
                r.retain_ids(&n, &e);
                Ok(r)
            },
        },
        Ana3 {
            name: "constrained",
            law: Law::Linear,
            motion: Motion::Any,
            iter_tol: 0.0,
            full_static: true,
            run: |c| Ok(static_3d(&constraints::solve_constrained_3d(&constraints::ConstrainedInput3D { solver: c.s.clone(), constraints: c.s.constraints.clone() })?)),
        },
        Ana3 {
            name: "certified linear",
            law: Law::Linear,
            motion: Motion::Any,
            iter_tol: 0.0,
            full_static: true,
            run: |c| Ok(static_3d(&dedaliano_engine::certify::solver::certify_linear_3d_full(&c.s)?.results)),
        },
        Ana3 {
            name: "load combinations",
            law: Law::Linear,
            motion: Motion::Any,
            iter_tol: 0.0,
            full_static: true,
            run: |c| {
                let mut s = c.s.clone();
                let loads = std::mem::take(&mut s.loads);
                let (a, b): (Vec<_>, Vec<_>) = loads.into_iter().enumerate().partition(|(k, _)| k % 2 == 0);
                let inp = load_cases::MultiCaseInput3D {
                    solver: s,
                    load_cases: vec![
                        load_cases::LoadCase3D { name: "A".into(), loads: a.into_iter().map(|x| x.1).collect() },
                        load_cases::LoadCase3D { name: "B".into(), loads: b.into_iter().map(|x| x.1).collect() },
                    ],
                    combinations: vec![load_cases::CombinationDef { name: "C".into(), factors: [("A".to_string(), 1.0), ("B".to_string(), 1.0)].into() }],
                };
                Ok(static_3d(&load_cases::solve_multi_case_3d(&inp)?.combination_results[0].results))
            },
        },
        Ana3 {
            name: "staged (one stage)",
            law: Law::Linear,
            motion: Motion::Any,
            iter_tol: 0.0,
            full_static: true,
            run: |c| Ok(static_3d(&staged_3d(&c.s, serde_json::json!([stage_all(&c.s, (0..c.s.loads.len()).collect())]))?.final_results)),
        },
        Ana3 {
            name: "staged (loads in two stages)",
            law: Law::Linear,
            motion: Motion::Any,
            iter_tol: 0.0,
            full_static: false,
            run: |c| {
                let n = c.s.loads.len();
                let s1 = stage_all(&c.s, (0..n).filter(|k| k % 2 == 0).collect());
                let s2 = serde_json::json!({ "name": "2", "loadIndices": (0..n).filter(|k| k % 2 == 1).collect::<Vec<_>>() });
                Ok(disp_3d(&staged_3d(&c.s, serde_json::json!([s1, s2]))?.final_results))
            },
        },
        Ana3 {
            name: "Winkler (no foundation)",
            law: Law::Linear,
            motion: Motion::Any,
            iter_tol: 0.0,
            full_static: true,
            run: |c| Ok(static_3d(&winkler::solve_winkler_3d(&winkler::WinklerInput3D { solver: c.s.clone(), foundation_springs: vec![] })?)),
        },
        Ana3 {
            name: "contact (no gaps)",
            law: Law::Linear,
            motion: Motion::Any,
            iter_tol: 1e-8,
            full_static: false,
            run: |c| {
                let inp: contact::ContactInput3D = serde_json::from_value(serde_json::json!({ "solver": c.s })).map_err(|e| e.to_string())?;
                Ok(static_3d(&conv(contact::solve_contact_3d(&inp).map(|r| (r.converged, r.results)))?))
            },
        },
        Ana3 {
            name: "SSI (no soil springs)",
            law: Law::Linear,
            motion: Motion::Any,
            iter_tol: 1e-8,
            full_static: false,
            run: |c| Ok(static_3d(&conv(ssi::solve_ssi_3d(&ssi::SSIInput3D { solver: c.s.clone(), soil_springs: vec![], max_iter: 50, tolerance: 1e-10 }).map(|r| (r.converged, r.results)))?)),
        },
        Ana3 {
            name: "creep & shrinkage (t = t0)",
            law: Law::Linear,
            motion: Motion::Any,
            iter_tol: 0.0,
            full_static: false,
            run: |c| {
                let inp = creep_shrinkage::CreepShrinkageInput3D {
                    solver: c.s.clone(), creep_params: HashMap::new(),
                    time_steps: vec![creep_shrinkage::TimeStep3D { t_days: 28.0, additional_loads: vec![] }], aging_coefficient: 0.8,
                };
                let r = creep_shrinkage::solve_creep_shrinkage_3d(&inp)?;
                let mut o = Resp::default();
                for d in &r.steps[0].displacements {
                    o.push(Some(d.node_id), None, "u", Kind::V3(Dim::LEN), vec![d.ux, d.uy, d.uz]);
                    o.push(Some(d.node_id), None, "r", Kind::V3(Dim::NONE), vec![d.rx, d.ry, d.rz]);
                }
                Ok(o)
            },
        },
        Ana3 {
            name: "P-Delta",
            law: Law::Nonlinear,
            motion: Motion::Any,
            iter_tol: 1e-10,
            full_static: false,
            run: |c| Ok(static_3d(&conv(pdelta::solve_pdelta_3d(&c.s, 100, 1e-12).map(|r| (r.converged, r.results)))?)),
        },
        Ana3 {
            name: "corotational",
            law: Law::Nonlinear,
            motion: Motion::Any,
            iter_tol: 1e-9,
            full_static: false,
            run: |c| Ok(static_3d(&conv(corotational::solve_corotational_3d(&c.s, 100, 1e-10, 4, false).map(|r| (r.converged, r.results)))?)),
        },
        Ana3 {
            name: "material nonlinear",
            law: Law::Nonlinear,
            motion: Motion::Any,
            iter_tol: 1e-9,
            full_static: false,
            run: |c| {
                let fy = c.p.fy * 1000.0;
                let inp = NonlinearMaterialInput3D {
                    solver: c.s.clone(),
                    material_models: c.s.materials.values().map(|x| (x.id.to_string(), MaterialModel { model_type: "elastic_perfectly_plastic".into(), fy: c.p.fy, alpha: None })).collect(),
                    section_capacities: c
                        .s
                        .sections
                        .values()
                        .map(|x| {
                            let (b, h) = rect3(x);
                            (x.id.to_string(), SectionCapacity3D { np: fy * x.a, mpy: fy * h * b * b / 4.0, mpz: fy * b * h * h / 4.0, mpx: Some(fy * x.j / b.min(h)) })
                        })
                        .collect(),
                    max_iter: 60,
                    tolerance: 1e-10,
                    n_increments: 4,
                };
                let r = conv(material_nonlinear::solve_nonlinear_material_3d(&inp).map(|r| (r.converged, r.results)))?;
                if !r.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::KnownIssue && d.phase.as_deref() == Some("NL-5") && d.value == Some(428.0)) {
                    return Err("missing containment warning safety #428".into());
                }
                Ok(static_3d(&r))
            },
        },
        Ana3 {
            name: "fiber nonlinear",
            law: Law::Nonlinear,
            motion: Motion::Any,
            iter_tol: 1e-9,
            full_static: false,
            run: |c| {
                let sections = c
                    .s
                    .sections
                    .values()
                    .map(|x| {
                        let (b, h) = rect3(x);
                        let e = c.s.elements.values().find(|e| e.section_id == x.id).map_or(200_000.0, |e| c.s.materials[&e.material_id.to_string()].e);
                        (x.id.to_string(), rect_fibers(b, h, 12, 12, e))
                    })
                    .collect();
                let inp = fiber_nonlinear::FiberNonlinearInput3D {
                    solver: c.s.clone(), fiber_sections: sections, n_integration_points: 5, max_iter: 60, tolerance: 1e-10, n_increments: 2, modified_nr: false,
                };
                Ok(static_3d(&conv(fiber_nonlinear::solve_fiber_nonlinear_3d(&inp).map(|r| (r.converged, r.results)))?))
            },
        },
        Ana3 {
            name: "cable solver",
            law: Law::Nonlinear,
            motion: Motion::AboutZ,
            iter_tol: 1e-9,
            full_static: false,
            run: |c| Ok(static_3d(&conv(cable::solve_cable_3d(&c.s, &c.dens, 100, 1e-10).map(|r| (r.converged, r.results)))?)),
        },
        Ana3 { name: "modal", law: Law::Indep, motion: Motion::Any, iter_tol: 1e-10, full_static: false, run: |c| Ok(modal_resp_3d(&modal::solve_modal_3d(&c.s, &c.dens, 6)?)) },
        Ana3 {
            name: "certified modal",
            law: Law::Indep,
            motion: Motion::Any,
            iter_tol: 1e-10,
            full_static: false,
            run: |c| Ok(modal_resp_3d(&dedaliano_engine::certify::modal::certify_modal_3d(&c.s, &c.dens, 6)?.results)),
        },
        Ana3 {
            name: "buckling",
            law: Law::Inverse,
            motion: Motion::Any,
            iter_tol: 1e-10,
            full_static: false,
            run: |c| {
                let r = buckling::solve_buckling_3d(&c.s, 3)?;
                let mut o = Resp::default();
                for (k, m) in r.modes.iter().enumerate() {
                    o.scalar(&format!("lambda{k}"), Dim::NONE, m.load_factor);
                }
                Ok(o)
            },
        },
        Ana3 {
            name: "time history",
            law: Law::Linear,
            motion: Motion::Any,
            iter_tol: 0.0,
            full_static: false,
            run: |c| {
                let loads = nodal_loads_3d(&c.s);
                let inp = TimeHistoryInput3D {
                    solver: c.s.clone(), densities: c.dens.clone(), time_step: c.p.dt, n_steps: 60, method: "newmark".into(),
                    beta: 0.25, gamma: 0.5, alpha: None, damping_xi: Some(0.05), ground_accel_x: None, ground_accel_y: None, ground_accel_z: None,
                    force_history: Some(vec![TimeForceRecord3D { time: 0.0, loads: loads.clone() }, TimeForceRecord3D { time: 1000.0 * c.p.dt, loads }]),
                };
                let r = time_integration::solve_time_history_3d(&inp)?;
                let mut o = Resp::default();
                for h in &r.node_histories {
                    for k in (0..h.ux.len()).step_by(if crate::generated::strict() { 1 } else { 10 }) {
                        o.push(Some(h.node_id), None, &format!("u_t{k:03}"), Kind::V3(Dim::LEN), vec![h.ux[k], h.uy[k], h.uz[k]]);
                        o.push(Some(h.node_id), None, &format!("r_t{k:03}"), Kind::V3(Dim::NONE), vec![h.rx[k], h.ry[k], h.rz[k]]);
                    }
                }
                Ok(o)
            },
        },
        Ana3 {
            name: "time history (ground motion)",
            law: Law::Indep,
            motion: Motion::Any,
            iter_tol: 0.0,
            full_static: false,
            run: |c| {
                // Three-component record a(t) = c.p.ground; rotates as a vector.
                let n = 60;
                let rec = |k: usize| -> Vec<f64> { (0..=n).map(|i| c.p.ground[k] * (0.9 * i as f64).sin() * (-(i as f64) / 40.0).exp()).collect() };
                let inp = TimeHistoryInput3D {
                    solver: c.s.clone(), densities: c.dens.clone(), time_step: c.p.dt, n_steps: n, method: "newmark".into(),
                    beta: 0.25, gamma: 0.5, alpha: None, damping_xi: Some(0.05),
                    ground_accel_x: Some(rec(0)), ground_accel_y: Some(rec(1)), ground_accel_z: Some(rec(2)), force_history: None,
                };
                let r = time_integration::solve_time_history_3d(&inp)?;
                let mut o = Resp::default();
                for h in &r.node_histories {
                    for k in (0..h.ux.len()).step_by(if crate::generated::strict() { 1 } else { 10 }) {
                        o.push(Some(h.node_id), None, &format!("u_t{k:03}"), Kind::V3(Dim::LEN), vec![h.ux[k], h.uy[k], h.uz[k]]);
                    }
                }
                Ok(o)
            },
        },
        Ana3 {
            name: "spectral",
            law: Law::Indep,
            motion: Motion::AxisPerm,
            iter_tol: 1e-10,
            full_static: false,
            run: |c| {
                // Six modes, extended to the end of a cluster: truncating
                // between two nearly repeated modes keeps an arbitrary mix of
                // the pair, and the response of a symmetric model is then not
                // symmetric (rich3d-5/sym, built from two copies joined at
                // one node, has such a pair at modes 6 and 7).
                let md = modal::solve_modal_3d(&c.s, &c.dens, 12)?;
                let mut n = md.modes.len().min(6);
                while n > 0 && n < md.modes.len() && md.modes[n].omega - md.modes[n - 1].omega <= 1e-3 * md.modes[n].omega {
                    n += 1;
                }
                let modes = md.modes[..n]
                    .iter()
                    .map(|x| SpectralModeInput3D {
                        frequency: x.frequency, period: x.period, omega: x.omega,
                        displacements: x.displacements.iter().map(|d| SpectralModeDisp3D { node_id: d.node_id, ux: d.ux, uy: d.uy, uz: d.uz, rx: d.rx, ry: d.ry, rz: d.rz }).collect(),
                        participation_x: x.participation_x, participation_y: x.participation_y, participation_z: x.participation_z,
                        effective_mass_x: x.effective_mass_x, effective_mass_y: x.effective_mass_y, effective_mass_z: x.effective_mass_z,
                    })
                    .collect();
                let pts = [(0.0, 0.2), (0.3, 0.5), (1.0, 0.5), (4.0, 0.12)];
                let inp = SpectralInput3D {
                    solver: c.s.clone(), modes, densities: c.dens.clone(),
                    spectrum: DesignSpectrum { name: "s".into(), points: pts.iter().map(|&(t, sa)| SpectrumPoint { period: t * c.p.dt / 0.002, sa }).collect(), in_g: Some(true) },
                    direction: ["X", "Y", "Z"][c.p.axis].into(), rule: Some("CQC".into()), xi: Some(0.05), importance_factor: None, reduction_factor: None, total_mass: None,
                };
                let r = spectral::solve_spectral_3d(&inp)?;
                let mut o = Resp::default();
                let sd = md.modes.first().map_or(0.0, |m| 0.5 * 9.81 / (m.omega * m.omega));
                for d in &r.displacements {
                    o.push(Some(d.node_id), None, "u", Kind::Abs3(Dim::LEN), vec![d.ux.abs(), d.uy.abs(), d.uz.abs()]);
                }
                o.set_floor("u", sd);
                o.scalar("base_shear", Dim::FORCE, r.base_shear);
                Ok(o)
            },
        },
        Ana3 {
            name: "harmonic",
            law: Law::Linear,
            motion: Motion::Any,
            iter_tol: 1e-10,
            full_static: false,
            run: |c| {
                let node = *c.probes.first().ok_or("no probe node")?;
                let mut comps = Vec::new();
                for dof in ["x", "y", "z"] {
                    let inp = harmonic::HarmonicInput3D {
                        solver: c.s.clone(), densities: c.dens.clone(), frequencies: c.p.freqs.clone(), damping_ratio: 0.05,
                        response_node_id: node, response_dof: dof.into(),
                    };
                    comps.push(harmonic::solve_harmonic_3d(&inp)?);
                }
                let mut o = Resp::default();
                let us = linear::solve_3d(&c.s).map(|r| r.displacements.iter().fold(0.0f64, |m, d| m.max(d.ux.abs()).max(d.uy.abs()).max(d.uz.abs()))).unwrap_or(0.0);
                for k in 0..c.p.freqs.len() {
                    let p = |i: usize| &comps[i].response_points[k];
                    o.push(Some(node), None, &format!("H_re{k}"), Kind::V3(Dim::LEN), vec![p(0).real, p(1).real, p(2).real]);
                    o.push(Some(node), None, &format!("H_im{k}"), Kind::V3(Dim::LEN), vec![p(0).imag, p(1).imag, p(2).imag]);
                    o.set_floor(&format!("H_re{k}"), us);
                    o.set_floor(&format!("H_im{k}"), us);
                }
                Ok(o)
            },
        },
        Ana3 {
            name: "plastic collapse",
            law: Law::Inverse,
            motion: Motion::Any,
            iter_tol: 5e-8 /* event resolution TIE = 1e-6 (solver/plastic.rs) / 20 */,
            full_static: false,
            run: |c| {
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
                let r = plastic::solve_plastic_3d(&PlasticInput3D { solver: c.s.clone(), sections, materials, max_hinges: None, mp_overrides: None })?;
                let mut o = Resp::default();
                o.scalar("collapse_factor", Dim::NONE, r.collapse_factor);
                Ok(o)
            },
        },
        Ana3 {
            name: "kinematic check",
            law: Law::Indep,
            motion: Motion::Any,
            iter_tol: 0.0,
            full_static: false,
            run: |c| {
                let r = kinematic::analyze_kinematics_3d(&c.s);
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
        Ana3 {
            name: "moving loads",
            law: Law::Nonlinear,
            motion: Motion::AboutZ,
            iter_tol: 0.0,
            full_static: false,
            run: |c| {
                let path = c.path.clone().ok_or("no deck path")?;
                let inp = MovingLoadInput3D {
                    solver: c.s.clone(),
                    train: LoadTrain { name: "two axles".into(), axles: vec![Axle { offset: 0.0, weight: c.p.axle }, Axle { offset: 3.0 * c.p.step, weight: 0.5 * c.p.axle }] },
                    step: Some(c.p.step),
                    path_element_ids: Some(path),
                    gravity_direction: None,
                };
                let r = moving_loads::solve_moving_loads_3d(&inp)?;
                let span: f64 = r.path.iter().map(|p| p.length).sum();
                let mut o = Resp::default();
                for (k, e) in &r.elements {
                    let id = Some(k.parse::<usize>().map_err(|e| e.to_string())?);
                    o.push(None, id, "My", Kind::Pair(Dim::MOMENT, false), vec![e.my_max_pos, e.my_max_neg]);
                    o.push(None, id, "Mz", Kind::Pair(Dim::MOMENT, false), vec![e.mz_max_pos, e.mz_max_neg]);
                    o.push(None, id, "Vz", Kind::Pair(Dim::FORCE, false), vec![e.vz_max_pos, e.vz_max_neg]);
                    o.push(None, id, "Vy", Kind::Pair(Dim::FORCE, false), vec![e.vy_max_pos, e.vy_max_neg]);
                    o.push(None, id, "N", Kind::Pair(Dim::FORCE, false), vec![e.n_max_pos, e.n_max_neg]);
                }
                for t in ["My", "Mz"] {
                    o.set_floor(t, c.p.axle * span);
                }
                for t in ["Vy", "Vz", "N"] {
                    o.set_floor(t, c.p.axle);
                }
                Ok(o)
            },
        },
        Ana3 {
            name: "influence line",
            law: Law::Indep,
            motion: Motion::AboutZ,
            iter_tol: 0.0,
            full_static: false,
            run: |c| {
                let path = c.path.as_ref().ok_or("no deck path")?;
                let inp = influence::InfluenceLineInput3D {
                    solver: c.s.clone(), quantity: "My_diag".into(), target_node_id: None, target_element_id: Some(path[1]),
                    target_position: 0.5, n_points_per_element: 4, gravity_direction: None,
                };
                let r = influence::compute_influence_line_3d(&inp)?;
                let mut o = Resp::default();
                for p in r.points.iter().filter(|p| path.contains(&p.element_id)) {
                    o.push(None, Some(p.element_id), &format!("IL_t{:04}", (p.t * 1000.0).round() as i64), Kind::Local(Dim::LEN, false), vec![p.value]);
                }
                Ok(o)
            },
        },
    ]
}
