//! Solid-shell (SHB8-ANS) elements across the analyses.
//!
//! A solid-shell node carries translations only. In a model that also has
//! frames or shells every node gets six DOFs, and the rotations of a node only
//! solid shells reach had no stiffness at all: every such model was refused as
//! "Singular stiffness matrix — structure is a mechanism", on the dense and on
//! the sparse path (the feature matrix pads a model with a frame to force the
//! sparse path, which is where it showed). Those rotations are now held by the
//! same artificial stiffness as orphan warping DOFs, a nodal moment on such a
//! node is refused, and a real mechanism is still refused.
//!
//! References are closed-form beam results for the strip (b = 0.6, t = 0.1,
//! L = 4, ν = 0) or the same model without the extra 6-DOF parts, which must
//! not change the solid shells' answer at all.
use dedaliano_engine::solver::{buckling, harmonic, kinematic, linear, modal, pdelta, spectral, time_integration};
use dedaliano_engine::types::*;
use std::collections::HashMap;

const E: f64 = 200_000.0; // MPa
const L: f64 = 4.0;
const B: f64 = 0.6;
const T: f64 = 0.1;
const RHO: f64 = 7_850.0;
const NX: usize = 8;
const NY: usize = 2;

fn empty() -> SolverInput3D {
    SolverInput3D {
        nodes: HashMap::new(), materials: HashMap::new(), sections: HashMap::new(), elements: HashMap::new(),
        supports: HashMap::new(), loads: vec![], constraints: vec![], left_hand: None, plates: HashMap::new(),
        quads: HashMap::new(), quad9s: HashMap::new(), solid_shells: HashMap::new(), curved_shells: HashMap::new(),
        curved_beams: vec![], connectors: HashMap::new(), solver_options: None, masses: Default::default(),
    }
}
fn node(s: &mut SolverInput3D, id: usize, x: f64, y: f64, z: f64) {
    s.nodes.insert(id.to_string(), SolverNode3D { id, x, y, z });
}
fn sup(s: &mut SolverInput3D, node_id: usize, f: [bool; 6]) {
    s.supports.insert(node_id.to_string(), SolverSupport3D {
        node_id, rx: f[0], ry: f[1], rz: f[2], rrx: f[3], rry: f[4], rrz: f[5],
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None, dx: None, dy: None, dz: None,
        drx: None, dry: None, drz: None, rw: None, kw: None, normal_x: None, normal_y: None, normal_z: None, is_inclined: None,
    });
}
fn nodal(s: &mut SolverInput3D, node_id: usize, f: [f64; 6]) {
    s.loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D { node_id, fx: f[0], fy: f[1], fz: f[2], mx: f[3], my: f[4], mz: f[5], bw: None }));
}
fn frame(s: &mut SolverInput3D, id: usize, ni: usize, nj: usize) {
    s.elements.insert(id.to_string(), SolverElement3D {
        id, elem_type: "frame".into(), node_i: ni, node_j: nj, material_id: 1, section_id: 1,
        release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
        release_t_start: false, release_t_end: false, local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
    });
}
fn bot(i: usize, j: usize) -> usize { 1000 + i * (NY + 1) + j }
fn top(i: usize, j: usize) -> usize { 2000 + i * (NY + 1) + j }

/// Solid-shell cantilever strip (nx × NY elements, length L·nx/NX), fixed at x = 0,
/// tip load `p` (kN, -z) shared over the tip nodes.
fn strip(nx: usize, p: f64) -> SolverInput3D {
    let mut s = empty();
    s.materials.insert("1".into(), SolverMaterial { id: 1, e: E, nu: 0.0 });
    for i in 0..=nx {
        for j in 0..=NY {
            let (x, y) = (L * i as f64 / NX as f64, B * (j as f64 / NY as f64 - 0.5));
            node(&mut s, bot(i, j), x, y, -T / 2.0);
            node(&mut s, top(i, j), x, y, T / 2.0);
        }
    }
    for j in 0..=NY {
        sup(&mut s, bot(0, j), [true; 6]);
        sup(&mut s, top(0, j), [true; 6]);
    }
    let mut id = 1;
    for i in 0..nx {
        for j in 0..NY {
            let q = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)];
            let nodes = [bot(q[0].0, q[0].1), bot(q[1].0, q[1].1), bot(q[2].0, q[2].1), bot(q[3].0, q[3].1),
                         top(q[0].0, q[0].1), top(q[1].0, q[1].1), top(q[2].0, q[2].1), top(q[3].0, q[3].1)];
            s.solid_shells.insert(id.to_string(), SolverSolidShellElement { id, nodes, material_id: 1 });
            id += 1;
        }
    }
    let w = [0.25, 0.5, 0.25];
    for j in 0..=NY {
        nodal(&mut s, bot(nx, j), [0.0, 0.0, -p * w[j] / 2.0, 0.0, 0.0, 0.0]);
        nodal(&mut s, top(nx, j), [0.0, 0.0, -p * w[j] / 2.0, 0.0, 0.0, 0.0]);
    }
    s
}

/// Add an independent fixed frame cantilever far away (6 DOFs per node).
fn with_frame(mut s: SolverInput3D, n: usize) -> SolverInput3D {
    s.sections.insert("1".into(), SolverSection3D { id: 1, name: None, a: 0.01, iy: 1e-5, iz: 1e-5, j: 2e-5, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None });
    for k in 0..=n {
        node(&mut s, 5000 + k, 100.0 + k as f64, 0.0, 0.0);
    }
    for k in 0..n {
        frame(&mut s, 5000 + k, 5000 + k, 5001 + k);
    }
    sup(&mut s, 5000, [true; 6]);
    s
}

fn disp(r: &AnalysisResults3D, id: usize) -> [f64; 3] {
    let d = r.displacements.iter().find(|d| d.node_id == id).unwrap();
    [d.ux, d.uy, d.uz]
}

fn densities() -> HashMap<String, f64> {
    [("1".to_string(), RHO)].into_iter().collect()
}

fn rel(a: f64, b: f64) -> f64 {
    (a - b).abs() / b.abs().max(1e-300)
}

/// Every translation of every solid-shell node agrees to `tol` (relative to the largest).
fn assert_same_translations(a: &AnalysisResults3D, b: &AnalysisResults3D, s: &SolverInput3D, tol: f64) {
    let ids: Vec<usize> = s.solid_shells.values().flat_map(|e| e.nodes).collect();
    let scale = ids.iter().flat_map(|&i| disp(b, i)).fold(0.0f64, |m, v| m.max(v.abs()));
    assert!(scale > 0.0);
    for &i in &ids {
        let (x, y) = (disp(a, i), disp(b, i));
        for k in 0..3 {
            assert!((x[k] - y[k]).abs() <= tol * scale, "node {i} comp {k}: {} vs {}", x[k], y[k]);
        }
    }
}

const EI: f64 = E * 1000.0 * B * T * T * T / 12.0; // kN·m², vertical bending

/// A stiff, light frame cantilever far away: six DOFs per node in the model,
/// its own modes far above the strip's.
fn stiff_frame(s: SolverInput3D) -> SolverInput3D {
    let mut s = with_frame(s, 2);
    let sec = s.sections.get_mut("1").unwrap();
    (sec.a, sec.iy, sec.iz, sec.j) = (0.01, 1e-3, 1e-3, 2e-3);
    for k in 0..=2 {
        s.nodes.get_mut(&(5000 + k).to_string()).unwrap().x = 100.0 + 0.5 * k as f64;
    }
    s
}

fn modes_in(md: &modal::ModalResult3D) -> Vec<SpectralModeInput3D> {
    md.modes.iter().map(|x| SpectralModeInput3D {
        frequency: x.frequency, period: x.period, omega: x.omega,
        displacements: x.displacements.iter().map(|d| SpectralModeDisp3D { node_id: d.node_id, ux: d.ux, uy: d.uy, uz: d.uz, rx: d.rx, ry: d.ry, rz: d.rz }).collect(),
        participation_x: x.participation_x, participation_y: x.participation_y, participation_z: x.participation_z,
        effective_mass_x: x.effective_mass_x, effective_mass_y: x.effective_mass_y, effective_mass_z: x.effective_mass_z,
    }).collect()
}

fn spectral_z(s: &SolverInput3D, n_modes: usize, sa_g: f64) -> spectral::SpectralResult3D {
    let md = modal::solve_modal_3d(s, &densities(), n_modes).unwrap();
    let inp = SpectralInput3D {
        solver: s.clone(), modes: modes_in(&md), densities: densities(),
        spectrum: DesignSpectrum { name: "flat".into(), points: vec![SpectrumPoint { period: 0.0, sa: sa_g }, SpectrumPoint { period: 10.0, sa: sa_g }], in_g: Some(true) },
        direction: "Z".into(), rule: Some("SRSS".into()), xi: Some(0.05), importance_factor: None, reduction_factor: None, total_mass: None,
    };
    spectral::solve_spectral_3d(&inp).unwrap()
}

// ==================== static ====================

#[test]
fn solid_shell_strip_matches_beam_theory() {
    let r = linear::solve_3d(&strip(NX, 2.0)).unwrap();
    let beam = -2.0 * L.powi(3) / (3.0 * EI);
    let tip = disp(&r, bot(NX, 1))[2];
    assert!(rel(tip, beam) < 0.01, "tip {tip} vs PL³/3EI {beam}");
}

#[test]
fn solid_shell_with_frames_solves_on_the_sparse_path() {
    // Was: "Singular stiffness matrix — structure is a mechanism".
    let s = strip(NX, 2.0);
    let alone = linear::solve_3d(&s).unwrap();
    let mixed = linear::solve_3d(&with_frame(s.clone(), 10)).unwrap();
    let path = &mixed.solver_run_meta.as_ref().unwrap().solver_path;
    assert!(path.starts_with("sparse") || path.starts_with("pcg"), "expected the sparse path, got {path}");
    assert_same_translations(&mixed, &alone, &s, 1e-9);
}

#[test]
fn solid_shell_with_frames_solves_on_the_dense_path() {
    // One element and a two-node frame: 60 DOFs, below the sparse threshold.
    let mut s = strip(1, 2.0);
    s.solid_shells.retain(|_, e| e.id == 1);
    for i in 0..=1 {
        s.nodes.remove(&bot(i, 2).to_string());
        s.nodes.remove(&top(i, 2).to_string());
        s.supports.remove(&bot(i, 2).to_string());
        s.supports.remove(&top(i, 2).to_string());
    }
    s.loads.retain(|l| !matches!(l, SolverLoad3D::Nodal(n) if n.node_id == bot(1, 2) || n.node_id == top(1, 2)));
    let alone = linear::solve_3d(&s).unwrap();
    let mixed = linear::solve_3d(&with_frame(s.clone(), 1)).unwrap();
    assert_eq!(mixed.solver_run_meta.as_ref().unwrap().solver_path, "dense_lu");
    assert_same_translations(&mixed, &alone, &s, 1e-9);
}

/// A frame prop under the tip, fixed at its foot, its top rotations free (the
/// solid-shell node gives them nothing): condensed onto the top node's
/// translations it is exactly the springs kx = ky = 3EI/Lp³, kz = EA/Lp.
#[test]
fn solid_shell_propped_by_a_frame_matches_springs() {
    let (a, i, lp) = (1e-5, 1e-7, 1.0);
    let tip = bot(NX, 1);
    let mut with_prop = strip(NX, 2.0);
    with_prop.sections.insert("1".into(), SolverSection3D { id: 1, name: None, a, iy: i, iz: i, j: 2.0 * i, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None });
    node(&mut with_prop, 6000, L, 0.0, -T / 2.0 - lp);
    frame(&mut with_prop, 6000, 6000, tip);
    sup(&mut with_prop, 6000, [true; 6]);
    // A sideways tip load too, so the prop's bending is exercised.
    nodal(&mut with_prop, tip, [0.5, 0.3, 0.0, 0.0, 0.0, 0.0]);

    let mut springs = strip(NX, 2.0);
    nodal(&mut springs, tip, [0.5, 0.3, 0.0, 0.0, 0.0, 0.0]);
    let e = E * 1000.0;
    sup(&mut springs, tip, [false; 6]);
    let sp = springs.supports.get_mut(&tip.to_string()).unwrap();
    (sp.kx, sp.ky, sp.kz) = (Some(3.0 * e * i / lp.powi(3)), Some(3.0 * e * i / lp.powi(3)), Some(e * a / lp));

    let r1 = linear::solve_3d(&with_prop).unwrap();
    let r2 = linear::solve_3d(&springs).unwrap();
    assert_same_translations(&r1, &r2, &springs, 1e-7);
    // The prop changes the answer: the comparison is not vacuous.
    let free = linear::solve_3d(&strip(NX, 2.0)).unwrap();
    assert!(rel(disp(&r1, tip)[2], disp(&free, tip)[2]) > 0.5);
}

/// The artificial stiffness goes only where nothing else does: a frame hanging
/// off one solid-shell node is free to spin about it, and that is still refused.
#[test]
fn frame_pinned_to_a_solid_shell_node_is_still_a_mechanism() {
    let mut s = strip(NX, 2.0);
    s.sections.insert("1".into(), SolverSection3D { id: 1, name: None, a: 0.01, iy: 1e-5, iz: 1e-5, j: 2e-5, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None });
    node(&mut s, 6000, L + 1.0, 0.0, -T / 2.0);
    frame(&mut s, 6000, bot(NX, 1), 6000);
    nodal(&mut s, 6000, [0.0, 0.0, -1.0, 0.0, 0.0, 0.0]);
    let err = linear::solve_3d(&s).expect_err("a frame spinning about a solid-shell node is a mechanism");
    assert!(err.to_lowercase().contains("mechanism") || err.to_lowercase().contains("singular"), "{err}");
}

#[test]
fn nodal_moment_on_a_solid_shell_node_is_refused() {
    // Solid shells only: no rotation DOFs, the moment used to be dropped.
    let mut s = strip(NX, 2.0);
    nodal(&mut s, bot(NX, 1), [0.0, 0.0, 0.0, 0.0, 1.0, 0.0]);
    let err = linear::solve_3d(&s).expect_err("moment on a solid-shell-only model");
    assert!(err.contains("moment") && err.contains(&bot(NX, 1).to_string()), "{err}");
    // With frames elsewhere: an orphan rotation, the moment would be lost.
    let mut m = with_frame(strip(NX, 2.0), 10);
    nodal(&mut m, bot(NX, 1), [0.0, 0.0, 0.0, 1.0, 0.0, 0.0]);
    let err = linear::solve_3d(&m).expect_err("moment on a solid-shell node of a mixed model");
    assert!(err.contains("moment"), "{err}");
    // Dynamic analyses read the same loads.
    let h = harmonic::HarmonicInput3D { solver: m.clone(), densities: densities(), frequencies: vec![1.0], damping_ratio: 0.05, response_node_id: bot(NX, 1), response_dof: "z".into() };
    assert!(harmonic::solve_harmonic_3d(&h).is_err());
    // Nor is a response read from such a rotation: it is not a DOF of the strip.
    let free = with_frame(strip(NX, 2.0), 10);
    let h = harmonic::HarmonicInput3D { solver: free.clone(), densities: densities(), frequencies: vec![1.0], damping_ratio: 0.05, response_node_id: bot(NX, 1), response_dof: "ry".into() };
    let err = harmonic::solve_harmonic_3d(&h).expect_err("response at an orphan rotation");
    assert!(err.contains("no stiffness"), "{err}");
    let h = harmonic::HarmonicInput3D { response_dof: "z".into(), ..h };
    harmonic::solve_harmonic_3d(&h).unwrap();
    // A moment on a frame node of the same model is fine.
    let mut ok = with_frame(strip(NX, 2.0), 10);
    nodal(&mut ok, 5010, [0.0, 0.0, 0.0, 0.0, 1.0, 0.0]);
    linear::solve_3d(&ok).unwrap();
}

#[test]
fn time_history_moment_on_a_solid_shell_node_is_refused() {
    let m = with_frame(strip(NX, 2.0), 10);
    let mom = vec![SolverNodalLoad3D { node_id: bot(NX, 1), fx: 0.0, fy: 0.0, fz: 0.0, mx: 0.0, my: 1.0, mz: 0.0, bw: None }];
    let inp = TimeHistoryInput3D {
        solver: m, densities: densities(), time_step: 0.002, n_steps: 10, method: "newmark".into(),
        beta: 0.25, gamma: 0.5, alpha: None, damping_xi: Some(0.05), ground_accel_x: None, ground_accel_y: None, ground_accel_z: None,
        force_history: Some(vec![TimeForceRecord3D { time: 0.0, loads: mom.clone() }, TimeForceRecord3D { time: 1.0, loads: mom }]),
    };
    let err = time_integration::solve_time_history_3d(&inp).expect_err("moment on a solid-shell node");
    assert!(err.contains("moment"), "{err}");
}

#[test]
fn pdelta_with_solid_shells_and_frames() {
    // Axial compression plus a small transverse load: P-Delta amplifies.
    let make = |s: SolverInput3D| {
        let mut s = s;
        let w = [0.25, 0.5, 0.25];
        for j in 0..=NY {
            nodal(&mut s, bot(NX, j), [-200.0 * w[j] / 2.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
            nodal(&mut s, top(NX, j), [-200.0 * w[j] / 2.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
        }
        s
    };
    let alone = make(strip(NX, 2.0));
    let mixed = make(with_frame(strip(NX, 2.0), 10));
    let a = pdelta::solve_pdelta_3d(&alone, 50, 1e-8).unwrap();
    let b = pdelta::solve_pdelta_3d(&mixed, 50, 1e-8).unwrap();
    assert!(a.converged && b.converged);
    assert_same_translations(&b.results, &a.results, &alone, 1e-7);
    // Amplification of the tip deflection ≈ 1 / (1 − P/Pcr), Pcr = π²EI/4L².
    let pcr = std::f64::consts::PI.powi(2) * EI / (4.0 * L * L);
    let amp = disp(&a.results, bot(NX, 1))[2] / disp(&a.linear_results, bot(NX, 1))[2];
    let expected = 1.0 / (1.0 - 200.0 / pcr);
    assert!(rel(amp, expected) < 0.03, "amplification {amp} vs {expected}");
}

// ==================== eigen ====================

#[test]
fn modal_solid_shell_matches_beam_and_mixed_model() {
    let s = strip(NX, 2.0);
    let alone = modal::solve_modal_3d(&s, &densities(), 4).unwrap();
    let m = RHO * B * T / 1000.0; // t/m
    let f1 = 1.875104f64.powi(2) / (2.0 * std::f64::consts::PI * L * L) * (EI / m).sqrt();
    assert!(rel(alone.modes[0].frequency, f1) < 0.01, "f1 {} vs {f1}", alone.modes[0].frequency);
    // Mass participation of the first mode: 61.3 % for a uniform cantilever.
    assert!((alone.modes[0].effective_mass_z / alone.total_mass - 0.613).abs() < 0.01);
    let mixed = modal::solve_modal_3d(&stiff_frame(s.clone()), &densities(), 4).unwrap();
    for k in 0..4 {
        assert!(rel(mixed.modes[k].frequency, alone.modes[k].frequency) < 1e-6, "mode {k}");
    }
}

#[test]
fn buckling_solid_shell_matches_euler_and_mixed_model() {
    let make = |s: SolverInput3D| {
        let mut s = s;
        s.loads.clear();
        let w = [0.25, 0.5, 0.25];
        for j in 0..=NY {
            nodal(&mut s, bot(NX, j), [-100.0 * w[j] / 2.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
            nodal(&mut s, top(NX, j), [-100.0 * w[j] / 2.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
        }
        s
    };
    let alone = buckling::solve_buckling_3d(&make(strip(NX, 0.0)), 2).unwrap();
    let pcr = std::f64::consts::PI.powi(2) * EI / (4.0 * L * L);
    assert!(rel(alone.modes[0].load_factor, pcr / 100.0) < 0.02, "{} vs {}", alone.modes[0].load_factor, pcr / 100.0);
    // The frame is unloaded: it does not buckle and must not change the factor.
    let mixed = buckling::solve_buckling_3d(&make(with_frame(strip(NX, 0.0), 10)), 2).unwrap();
    assert!(rel(mixed.modes[0].load_factor, alone.modes[0].load_factor) < 1e-6);
}

// ==================== dynamics ====================

/// Response spectrum against a hand calculation: one mode, flat spectrum,
/// u_tip = Γ₁ φ₁(L) · Sa / ω₁², with Γ₁ φ₁(L) = 1.5660 for a uniform cantilever
/// (φ₁ normalized to 1 at the tip) and ω₁ from beam theory.
#[test]
fn spectral_solid_shell_matches_hand_calculation() {
    let s = strip(NX, 2.0);
    let sa_g = 0.3;
    let r = spectral_z(&s, 1, sa_g);
    let m = RHO * B * T / 1000.0;
    let w1 = 1.875104f64.powi(2) / (L * L) * (EI / m).sqrt();
    let hand = 1.5660 * sa_g * 9.81 / (w1 * w1);
    let tip = disp_s(&r, bot(NX, 1));
    assert!(rel(tip[2], hand) < 0.015, "spectral tip {} vs hand {hand}", tip[2]);
    // The bottom fibre also moves along x, by θ·t/2 — a real displacement of
    // that node, not a spurious mode: same sign and size on the top fibre.
    let top_tip = disp_s(&r, top(NX, 1));
    assert!(rel(top_tip[0], tip[0]) < 1e-6 && rel(top_tip[2], tip[2]) < 1e-3);
    let theta = 1.5660 * sa_g * 9.81 / (w1 * w1) * 1.3765 / L; // φ₁'(L)·L / φ₁(L) = 1.3765
    assert!(rel(tip[0], theta * T / 2.0) < 0.05, "ux {} vs θt/2 {}", tip[0], theta * T / 2.0);
    // All four modes: the higher ones add little at the tip (SRSS).
    let r4 = spectral_z(&s, 4, sa_g);
    let t4 = disp_s(&r4, bot(NX, 1))[2];
    assert!(t4 >= tip[2] && t4 < 1.02 * tip[2], "{t4} vs {}", tip[2]);
}

fn disp_s(r: &spectral::SpectralResult3D, id: usize) -> [f64; 3] {
    let d = r.displacements.iter().find(|d| d.node_id == id).unwrap();
    [d.ux, d.uy, d.uz]
}

#[test]
fn spectral_mixed_model_matches_solid_shell_alone() {
    let s = strip(NX, 2.0);
    let a = spectral_z(&s, 4, 0.3);
    let b = spectral_z(&stiff_frame(s.clone()), 4, 0.3);
    for id in [bot(NX, 1), top(NX / 2, 0)] {
        let (x, y) = (disp_s(&b, id), disp_s(&a, id));
        for k in [0, 2] {
            assert!(rel(x[k], y[k]) < 1e-6, "node {id} comp {k}: {} vs {}", x[k], y[k]);
        }
    }
}

#[test]
fn harmonic_solid_shell_static_limit_and_mixed_model() {
    let s = strip(NX, 2.0);
    let run = |m: &SolverInput3D| {
        let h = harmonic::HarmonicInput3D { solver: m.clone(), densities: densities(), frequencies: vec![0.0, 2.0], damping_ratio: 0.05, response_node_id: bot(NX, 1), response_dof: "z".into() };
        harmonic::solve_harmonic_3d(&h).unwrap()
    };
    let a = run(&s);
    // Rayleigh damping is anchored on the model's first two modes: the frame's
    // modes must lie above the strip's for the damping to be the same.
    let b = run(&stiff_frame(s.clone()));
    let stat = disp(&linear::solve_3d(&s).unwrap(), bot(NX, 1))[2];
    assert!(rel(a.response_points[0].amplitude, stat.abs()) < 1e-3, "{} vs {stat}", a.response_points[0].amplitude);
    for k in 0..2 {
        assert!(rel(b.response_points[k].amplitude, a.response_points[k].amplitude) < 1e-4, "point {k}: {} vs {} ({} / {})", b.response_points[k].amplitude, a.response_points[k].amplitude, b.method, a.method);
    }
}

#[test]
fn time_history_solid_shell_mixed_model_matches_alone() {
    let s = strip(NX, 2.0);
    let run = |m: &SolverInput3D| {
        let loads: Vec<SolverNodalLoad3D> = s.loads.iter().filter_map(|l| match l { SolverLoad3D::Nodal(n) => Some(n.clone()), _ => None }).collect();
        let inp = TimeHistoryInput3D {
            solver: m.clone(), densities: densities(), time_step: 0.002, n_steps: 200, method: "newmark".into(),
            beta: 0.25, gamma: 0.5, alpha: None, damping_xi: Some(0.05), ground_accel_x: None, ground_accel_y: None, ground_accel_z: None,
            force_history: Some(vec![TimeForceRecord3D { time: 0.0, loads: loads.clone() }, TimeForceRecord3D { time: 10.0, loads }]),
        };
        time_integration::solve_time_history_3d(&inp).unwrap()
    };
    let a = run(&s);
    let b = run(&stiff_frame(s.clone()));
    let ha = a.node_histories.iter().find(|h| h.node_id == bot(NX, 1)).unwrap();
    let hb = b.node_histories.iter().find(|h| h.node_id == bot(NX, 1)).unwrap();
    let peak = ha.uz.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    // A suddenly applied load: the peak is about twice the static deflection.
    let stat = disp(&linear::solve_3d(&s).unwrap(), bot(NX, 1))[2].abs();
    assert!(peak > 1.5 * stat && peak < 2.05 * stat, "peak {peak} vs static {stat}");
    for k in 0..ha.uz.len() {
        assert!((ha.uz[k] - hb.uz[k]).abs() < 1e-6 * peak, "step {k}: {} vs {}", hb.uz[k], ha.uz[k]);
    }
}


/// The kinematic check sees the same thing: the strip meshed with frames is
/// solvable, a frame free to spin about a solid-shell node is a mechanism.
#[test]
fn kinematic_check_with_solid_shells_and_frames() {
    assert!(kinematic::analyze_kinematics_3d(&strip(NX, 2.0)).is_solvable);
    assert!(kinematic::analyze_kinematics_3d(&with_frame(strip(NX, 2.0), 10)).is_solvable);
    let mut s = strip(NX, 2.0);
    s.sections.insert("1".into(), SolverSection3D { id: 1, name: None, a: 0.01, iy: 1e-5, iz: 1e-5, j: 2e-5, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None });
    node(&mut s, 6000, L + 1.0, 0.0, -T / 2.0);
    frame(&mut s, 6000, bot(NX, 1), 6000);
    let k = kinematic::analyze_kinematics_3d(&s);
    assert!(!k.is_solvable, "{k:?}");
}

/// The artificial stiffness covers only DOFs no element is meant to stiffen.
/// A member whose own torsion constant is zero is an input error, refused by
/// name before assembly — not a twist held by the artificial spring.
#[test]
fn frame_with_zero_torsion_constant_is_refused() {
    let mut s = empty();
    s.materials.insert("1".into(), SolverMaterial { id: 1, e: E, nu: 0.3 });
    s.sections.insert("1".into(), SolverSection3D { id: 1, name: None, a: 0.01, iy: 5e-5, iz: 1e-4, j: 0.0, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None });
    node(&mut s, 1, 0.0, 0.0, 0.0);
    node(&mut s, 2, 5.0, 0.0, 0.0);
    frame(&mut s, 1, 1, 2);
    sup(&mut s, 1, [true; 6]);
    nodal(&mut s, 2, [0.0, -10.0, 0.0, 0.0, 0.0, 0.0]);
    let err = linear::solve_3d(&s).expect_err("J = 0");
    assert!(err.contains("torsion constant J must be > 0"), "{err}");
    let err = modal::solve_modal_3d(&s, &densities(), 2).expect_err("J = 0");
    assert!(err.contains("torsion constant"), "{err}");
    // Released in torsion at an end, the member has no torsional stiffness and
    // J is not used: no refusal on that account.
    s.elements.get_mut("1").unwrap().release_t_end = true;
    let r = linear::solve_3d(&s);
    assert!(r.as_ref().err().map_or(true, |e| !e.contains("torsion constant")), "{r:?}");
}

#[test]
fn rotated_solid_shell_nonstress_analyses_remain_available() {
    let mut s = strip(NX, 0.0);
    for n in s.nodes.values_mut() { let y = n.y; n.y = -n.z; n.z = y; }
    for j in 0..=NY {
        nodal(&mut s, bot(NX, j), [-1.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
        nodal(&mut s, top(NX, j), [-1.0, 0.0, 0.0, 0.0, 0.0, 0.0]);
    }
    assert!(linear::solve_3d(&s).unwrap_err().contains("SH-GLOBAL-STRESS"));
    let modal = modal::solve_modal_3d(&s, &densities(), 2).unwrap();
    assert!(modal.modes[0].frequency > 0.0);
    let buckling = buckling::solve_buckling_3d(&s, 1).unwrap();
    assert!(buckling.modes[0].load_factor > 0.0);
    let harmonic = harmonic::solve_harmonic_3d(&harmonic::HarmonicInput3D {
        solver: s, densities: densities(), frequencies: vec![0.1], damping_ratio: 0.05,
        response_node_id: bot(NX, 0), response_dof: "x".into(),
    }).unwrap();
    for ds in [&modal.structured_diagnostics, &buckling.structured_diagnostics, &harmonic.structured_diagnostics] {
        assert!(!ds.iter().any(|d| d.phase.as_deref() == Some("SH-GLOBAL-STRESS")));
    }
}
