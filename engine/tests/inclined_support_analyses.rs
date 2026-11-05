//! Every analysis that accepts inclined supports, against the same structure
//! turned rigidly so that the support is axis-aligned (a plain restraint, no
//! inclined frame). Eigenvalues are invariant under the rotation; mode shapes,
//! displacements, histories and reactions rotate with it.
//!
//! The analyses used to rotate the stiffness into the support frame and leave
//! the matrices built beside it (mass, geometric stiffness, influence vectors,
//! load histories) in global axes, and reported shapes and states in the
//! support frame. Each test runs a small model (dense paths) and a subdivided
//! one (sparse paths, past the 64-free-DOF threshold) where the solver has
//! both.
//!
//! The 2D model also has nodes reached only by trusses, whose rotations carry
//! no mass: modal analysis used to fail on them with "Eigenvalue
//! decomposition failed" (the dense generalized eigensolve factored M).

use dedaliano_engine::certify::buckling::{certify_buckling_3d, BucklingCertificate};
use dedaliano_engine::certify::modal::{certify_modal_2d, certify_modal_3d};
use dedaliano_engine::solver::harmonic::{solve_harmonic_2d, solve_harmonic_3d, HarmonicInput, HarmonicInput3D, HarmonicResponsePoint, HarmonicResult};
use dedaliano_engine::solver::reduction::{craig_bampton_2d, craig_bampton_3d, CraigBamptonInput, CraigBamptonInput3D, CraigBamptonResult};
use dedaliano_engine::solver::{buckling, modal, pdelta, spectral, time_integration};
use dedaliano_engine::types::*;
use std::collections::HashMap;

fn assert_close(what: &str, a: f64, b: f64, scale: f64, rel: f64) {
    assert!((a - b).abs() <= rel * scale.max(1e-300), "{what}: {a} vs {b} (scale {scale})");
}

/// `va` equals `vb` up to one scale factor (mode shapes are normalized to
/// their largest global component, which a rotation changes) and sign.
fn assert_same_shape(what: &str, va: &[f64], vb: &[f64], rel: f64) {
    let s = va.iter().zip(vb).map(|(p, q)| p * q).sum::<f64>() / va.iter().map(|p| p * p).sum::<f64>();
    let scale = vb.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    for (i, (p, q)) in va.iter().zip(vb).enumerate() {
        assert_close(&format!("{what} component {i}"), s * p, *q, scale, rel);
    }
}

fn densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), 7850.0);
    d
}

// ─── 2D ────────────────────────────────────────────────────────────────────

/// Rotation by +theta in the x–z plane.
fn rot2(theta: f64, x: f64, z: f64) -> (f64, f64) {
    let (s, c) = theta.sin_cos();
    (c * x - s * z, s * x + c * z)
}

/// Portal 1-2-3-4 (fixed base at 1, inclined roller at angle `theta` at 4),
/// its frames split into `sub` elements, with a truss branch 3-5-6 ending on a
/// spring at angle −theta at 6; nodes 5 and 6 are reached only by trusses.
/// `rotated` turns it by +theta: a rollerX at 4 and an unangled spring.
fn model_2d(theta: f64, rotated: bool, sub: usize, loads: &[(usize, f64, f64)]) -> SolverInput {
    let r = |x: f64, z: f64| if rotated { rot2(theta, x, z) } else { (x, z) };
    let pts = [(1, 0.0, 0.0), (2, 0.0, 4.0), (3, 5.0, 4.0), (4, 5.0, 0.0), (5, 8.0, 6.0), (6, 10.0, 4.0)];
    let mut nodes = HashMap::new();
    let mut xy = HashMap::new();
    for (id, x, z) in pts {
        xy.insert(id, (x, z));
        let (x, z) = r(x, z);
        nodes.insert(id.to_string(), SolverNode { id, x, z });
    }
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });
    sections.insert("2".to_string(), SolverSection { id: 2, a: 0.002, iz: 1e-6, as_y: None });
    let mut elements = HashMap::new();
    let mut next_node = 100;
    let mut next_elem = 1;
    let mut add = |t: &str, ni: usize, nj: usize, sec: usize, elements: &mut HashMap<String, SolverElement>| {
        elements.insert(next_elem.to_string(), SolverElement {
            id: next_elem, elem_type: t.to_string(), node_i: ni, node_j: nj,
            material_id: 1, section_id: sec, hinge_start: false, hinge_end: false,
        });
        next_elem += 1;
    };
    for (a, b) in [(1, 2), (2, 3), (3, 4)] {
        let (pa, pb) = (xy[&a], xy[&b]);
        let mut prev = a;
        for k in 1..=sub {
            let id = if k == sub { b } else {
                let t = k as f64 / sub as f64;
                let (x, z) = r(pa.0 + t * (pb.0 - pa.0), pa.1 + t * (pb.1 - pa.1));
                next_node += 1;
                nodes.insert(next_node.to_string(), SolverNode { id: next_node, x, z });
                next_node
            };
            add("frame", prev, id, 1, &mut elements);
            prev = id;
        }
    }
    add("truss", 3, 5, 2, &mut elements);
    add("truss", 5, 6, 2, &mut elements);
    let sup = |id: usize, node_id: usize, t: &str, k: Option<(f64, f64)>, angle: Option<f64>| SolverSupport {
        id, node_id, support_type: t.to_string(),
        kx: k.map(|k| k.0), ky: k.map(|k| k.1), kz: None, dx: None, dz: None, dry: None, angle,
    };
    let mut supports = HashMap::new();
    supports.insert("1".to_string(), sup(1, 1, "fixed", None, None));
    supports.insert("2".to_string(), if rotated {
        sup(2, 4, "rollerX", None, None)
    } else {
        sup(2, 4, "inclinedRoller", None, Some(theta))
    });
    supports.insert("3".to_string(), sup(3, 6, "spring", Some((5e3, 2e4)), if rotated { None } else { Some(-theta) }));
    let loads = loads.iter().map(|&(node_id, fx, fz)| {
        let (fx, fz) = r(fx, fz);
        SolverLoad::Nodal(SolverNodalLoad { node_id, fx, fz, my: 0.0 })
    }).collect();
    SolverInput {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![], connectors: HashMap::new(), solver_options: None, masses: Default::default(),
    }
}

const THETA: f64 = 0.5;
const LOADS_2D: [(usize, f64, f64); 3] = [(2, 10.0, -300.0), (3, 0.0, -300.0), (5, 5.0, -20.0)];
/// Dense (small) and sparse (subdivided) paths.
const SUBS: [usize; 2] = [1, 8];

/// Node → (ux, uz, ry) of the original model, turned into the rotated model's axes.
fn rotated_2d(theta: f64, d: &[Displacement]) -> HashMap<usize, [f64; 3]> {
    d.iter().map(|d| {
        let (x, z) = rot2(theta, d.ux, d.uz);
        (d.node_id, [x, z, d.ry])
    }).collect()
}

/// The original shape (rotated) and the reference shape as flat vectors, the
/// truss-only nodes' rotations left out.
fn shape_pair_2d(theta: f64, a: &[Displacement], b: &[Displacement]) -> (Vec<f64>, Vec<f64>) {
    let ra = rotated_2d(theta, a);
    let (mut va, mut vb) = (Vec::new(), Vec::new());
    for d in b {
        let x = ra[&d.node_id];
        let k = if d.node_id == 5 || d.node_id == 6 { 2 } else { 3 };
        va.extend_from_slice(&x[..k]);
        vb.extend_from_slice(&[d.ux, d.uz, d.ry][..k]);
    }
    (va, vb)
}

#[test]
fn modal_2d_inclined_roller_matches_rotated_model() {
    for sub in SUBS {
        let a = modal::solve_modal_2d(&model_2d(THETA, false, sub, &[]), &densities(), 5).expect("original");
        let b = modal::solve_modal_2d(&model_2d(THETA, true, sub, &[]), &densities(), 5).expect("rotated");
        assert_eq!(a.modes.len(), b.modes.len());
        for (k, (ma, mb)) in a.modes.iter().zip(&b.modes).enumerate() {
            let what = format!("sub {sub} mode {k}");
            assert_close(&format!("{what} frequency"), ma.frequency, mb.frequency, mb.frequency, 1e-8);
            let (va, vb) = shape_pair_2d(THETA, &ma.displacements, &mb.displacements);
            assert_same_shape(&what, &va, &vb, 1e-6);
            // The effective mass summed over two orthogonal directions does
            // not depend on the axes (the influence vectors rotate).
            let (ea, eb) = (ma.effective_mass_x + ma.effective_mass_y, mb.effective_mass_x + mb.effective_mass_y);
            assert_close(&format!("{what} effective mass"), ea, eb, a.total_mass, 1e-8);
        }
        let cert = certify_modal_2d(&model_2d(THETA, false, sub, &[]), &densities(), 3).expect("certify");
        assert!(cert.certificate.is_certified(), "sub {sub}: {:?}", cert.certificate);
    }
}

#[test]
fn modal_2d_truss_only_nodes_in_a_frame() {
    // No inclined support: the reference model alone. Nodes 5 and 6 are
    // reached only by trusses, so their rotations have stiffness (the orphan
    // guard) and no mass.
    for sub in SUBS {
        let input = model_2d(THETA, true, sub, &[]);
        let r = modal::solve_modal_2d(&input, &densities(), 4).expect("modal with truss-only nodes");
        assert_eq!(r.modes.len(), 4);
        assert!(r.modes.iter().all(|m| m.frequency.is_finite() && m.frequency > 0.0));
        let cert = certify_modal_2d(&input, &densities(), 4).expect("certify");
        assert!(cert.certificate.is_certified(), "sub {sub}: {:?}", cert.certificate);
    }
}

const FREQS: [f64; 5] = [0.5, 2.0, 4.0, 6.5, 9.0];

/// A harmonic sweep, or zeros when the response DOF is restrained (the
/// reference model's normal component at the support).
fn restrained_is_zero(r: Result<HarmonicResult, String>) -> HarmonicResult {
    match r {
        Ok(r) => r,
        Err(e) if e == "Target DOF is restrained" => HarmonicResult {
            structured_diagnostics: vec![],
            response_points: FREQS.iter().map(|&f| HarmonicResponsePoint {
                frequency: f, omega: 0.0, amplitude: 0.0, phase: 0.0, real: 0.0, imag: 0.0,
            }).collect(),
            peak_frequency: 0.0, peak_amplitude: 0.0, method: String::new(), modes_used: 0, n_dof: 0,
            truncation_ratio: None, warnings: vec![],
        },
        Err(e) => panic!("harmonic: {e}"),
    }
}

#[test]
fn harmonic_2d_inclined_roller_matches_rotated_model() {
    let (s, c) = THETA.sin_cos();
    for sub in SUBS {
        // A response component of the original is (Q e)·u of the rotated
        // model: combine its x and y responses (both complex, linear in u).
        for (node, dof) in [(3usize, "x"), (3, "y"), (4, "x"), (4, "y")] {
            let run = |rotated: bool, dof: &str| restrained_is_zero(solve_harmonic_2d(&HarmonicInput {
                solver: model_2d(THETA, rotated, sub, &LOADS_2D),
                densities: densities(),
                frequencies: FREQS.to_vec(),
                damping_ratio: 0.05,
                response_node_id: node,
                response_dof: dof.to_string(),
            }));
            let a = run(false, dof);
            let (bx, by) = (run(true, "x"), run(true, "y"));
            let (wx, wy) = if dof == "x" { (c, s) } else { (-s, c) };
            let scale = a.response_points.iter().fold(0.0f64, |m, p| m.max(p.amplitude));
            assert!(scale > 0.0);
            for (k, p) in a.response_points.iter().enumerate() {
                let what = format!("sub {sub} node {node} {dof} f {}", p.frequency);
                let (qx, qy) = (&bx.response_points[k], &by.response_points[k]);
                assert_close(&format!("{what} re"), p.real, wx * qx.real + wy * qy.real, scale, 1e-6);
                assert_close(&format!("{what} im"), p.imag, wx * qx.imag + wy * qy.imag, scale, 1e-6);
            }
        }
    }
}

fn spectral_modes_2d(r: &modal::ModalResult) -> Vec<SpectralModeInput> {
    r.modes.iter().map(|m| SpectralModeInput {
        frequency: m.frequency, period: m.period, omega: m.omega,
        displacements: m.displacements.iter().map(|d| SpectralModeDisp { node_id: d.node_id, ux: d.ux, uz: d.uz, ry: d.ry }).collect(),
        participation_x: m.participation_x, participation_y: m.participation_y,
        effective_mass_x: m.effective_mass_x, effective_mass_y: m.effective_mass_y,
    }).collect()
}

fn spectrum() -> DesignSpectrum {
    DesignSpectrum {
        name: "test".into(),
        points: vec![SpectrumPoint { period: 0.0, sa: 0.4 }, SpectrumPoint { period: 0.5, sa: 1.0 }, SpectrumPoint { period: 3.0, sa: 0.2 }],
        in_g: Some(true),
    }
}

#[test]
fn spectral_2d_inclined_roller_matches_rotated_model() {
    // A quarter turn maps the original's X excitation onto the rotated
    // model's Y (spectral analysis excites one global axis at a time), while
    // the inclined roller (normal along X) still goes through the rotation.
    let theta = std::f64::consts::FRAC_PI_2;
    for sub in SUBS {
        for rule in ["SRSS", "CQC"] {
            let run = |rotated: bool, direction: &str| {
                let solver = model_2d(theta, rotated, sub, &[]);
                let m = modal::solve_modal_2d(&solver, &densities(), 4).expect("modal");
                spectral::solve_spectral_2d(&SpectralInput {
                    solver, modes: spectral_modes_2d(&m), densities: densities(), spectrum: spectrum(),
                    direction: direction.into(), rule: Some(rule.into()), xi: Some(0.05),
                    importance_factor: None, reduction_factor: None, total_mass: None,
                }).expect("spectral")
            };
            let (a, b) = (run(false, "X"), run(true, "Y"));
            assert_close("base shear", a.base_shear, b.base_shear, b.base_shear, 1e-8);
            let fb: HashMap<usize, &spectral::SpectralElementForce> = b.element_forces.iter().map(|f| (f.element_id, f)).collect();
            let scale = b.element_forces.iter().fold(0.0f64, |m, f| m.max(f.n_max).max(f.v_max).max(f.m_max));
            for fa in &a.element_forces {
                let fb = fb[&fa.element_id];
                let what = format!("sub {sub} {rule} element {}", fa.element_id);
                assert_close(&format!("{what} N"), fa.n_max, fb.n_max, scale, 1e-6);
                assert_close(&format!("{what} V"), fa.v_max, fb.v_max, scale, 1e-6);
                assert_close(&format!("{what} M"), fa.m_max, fb.m_max, scale, 1e-6);
            }
        }
    }
}

/// Reduced matrices of a Craig–Bampton model: interior frequencies are
/// invariant, and so are the traces of the boundary blocks (the boundary
/// node's translations rotate, an orthogonal change of basis).
fn assert_cb_same(what: &str, a: &CraigBamptonResult, b: &CraigBamptonResult) {
    assert_eq!(a.interior_frequencies.len(), b.interior_frequencies.len(), "{what}");
    for (k, (fa, fb)) in a.interior_frequencies.iter().zip(&b.interior_frequencies).enumerate() {
        assert_close(&format!("{what} interior frequency {k}"), *fa, *fb, *fb, 1e-8);
    }
    let trace = |m: &[f64], n: usize, nb: usize| (0..nb).map(|i| m[i * n + i]).sum::<f64>();
    let (n, nb) = (a.n_reduced, a.n_boundary);
    assert_eq!((n, nb), (b.n_reduced, b.n_boundary), "{what}");
    let (ka, kb) = (trace(&a.k_reduced, n, nb), trace(&b.k_reduced, n, nb));
    assert_close(&format!("{what} trace K_bb"), ka, kb, kb, 1e-8);
    let (ma, mb) = (trace(&a.m_reduced, n, nb), trace(&b.m_reduced, n, nb));
    assert_close(&format!("{what} trace M_bb"), ma, mb, mb, 1e-8);
}

#[test]
fn craig_bampton_2d_inclined_roller_matches_rotated_model() {
    for sub in SUBS {
        let run = |rotated: bool| craig_bampton_2d(&CraigBamptonInput {
            solver: model_2d(THETA, rotated, sub, &[]), boundary_nodes: vec![2], n_modes: 4, densities: densities(),
        }).expect("craig-bampton");
        assert_cb_same(&format!("sub {sub}"), &run(false), &run(true));
    }
}

#[test]
fn pdelta_2d_inclined_roller_matches_rotated_model() {
    for sub in SUBS {
        let a = pdelta::solve_pdelta_2d(&model_2d(THETA, false, sub, &LOADS_2D), 30, 1e-10).expect("original");
        let b = pdelta::solve_pdelta_2d(&model_2d(THETA, true, sub, &LOADS_2D), 30, 1e-10).expect("rotated");
        let ra = rotated_2d(THETA, &a.results.displacements);
        let scale = b.results.displacements.iter().fold(0.0f64, |m, d| m.max(d.ux.abs()).max(d.uz.abs()));
        for d in &b.results.displacements {
            let x = ra[&d.node_id];
            let what = format!("sub {sub} node {}", d.node_id);
            assert_close(&format!("{what} ux"), x[0], d.ux, scale, 1e-7);
            assert_close(&format!("{what} uz"), x[1], d.uz, scale, 1e-7);
            if d.node_id != 5 && d.node_id != 6 {
                assert_close(&format!("{what} ry"), x[2], d.ry, scale, 1e-7);
            }
        }
        let rb: HashMap<usize, &Reaction> = b.results.reactions.iter().map(|r| (r.node_id, r)).collect();
        let r_scale = b.results.reactions.iter().fold(0.0f64, |m, r| m.max(r.rx.abs()).max(r.rz.abs()).max(r.my.abs()));
        for r in &a.results.reactions {
            let (rx, rz) = rot2(THETA, r.rx, r.rz);
            let rb = rb[&r.node_id];
            assert_close(&format!("sub {sub} reaction {} rx", r.node_id), rx, rb.rx, r_scale, 1e-7);
            assert_close(&format!("sub {sub} reaction {} rz", r.node_id), rz, rb.rz, r_scale, 1e-7);
            assert_close(&format!("sub {sub} reaction {} my", r.node_id), r.my, rb.my, r_scale, 1e-7);
        }
    }
}

// ─── 3D ────────────────────────────────────────────────────────────────────

type Mat3 = [[f64; 3]; 3];

fn mul3(q: &Mat3, v: [f64; 3]) -> [f64; 3] {
    [0, 1, 2].map(|i| q[i][0] * v[0] + q[i][1] * v[1] + q[i][2] * v[2])
}

/// The rotation taking the unit vector `n` onto `e` (Rodrigues).
fn rotation_onto(n: [f64; 3], e: [f64; 3]) -> Mat3 {
    let k = [n[1] * e[2] - n[2] * e[1], n[2] * e[0] - n[0] * e[2], n[0] * e[1] - n[1] * e[0]];
    let s = (k[0] * k[0] + k[1] * k[1] + k[2] * k[2]).sqrt();
    let c = n[0] * e[0] + n[1] * e[1] + n[2] * e[2];
    let k = k.map(|x| x / s);
    let kx = [[0.0, -k[2], k[1]], [k[2], 0.0, -k[0]], [-k[1], k[0], 0.0]];
    let mut q = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            let kk: f64 = (0..3).map(|m| kx[i][m] * kx[m][j]).sum();
            q[i][j] = if i == j { 1.0 } else { 0.0 } + s * kx[i][j] + (1.0 - c) * kk;
        }
    }
    q
}

fn normalize(v: [f64; 3]) -> [f64; 3] {
    let l = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    v.map(|x| x / l)
}

/// A spatial frame: column 1-2 (fixed at 1), beam 2-3, leg 3-4 on an inclined
/// support of normal `normal` at 4, and an overhang 3-5; frames split into
/// `sub` elements. (No truss-only node: the 3D static solve does not guard
/// their rotations.)
/// `q`: the rigid rotation of the reference model, which takes `normal` onto
/// the Y axis there, where node 4 gets a plain `ry` restraint. Sections are
/// doubly symmetric (Iy = Iz), so the members' default local axes do not
/// matter.
fn model_3d(normal: [f64; 3], q: Option<&Mat3>, sub: usize, loads: &[(usize, [f64; 3])]) -> SolverInput3D {
    let r = |v: [f64; 3]| q.map_or(v, |q| mul3(q, v));
    let pts = [(1, [0.0, 0.0, 0.0]), (2, [0.0, 0.0, 3.0]), (3, [4.0, 0.0, 3.0]), (4, [4.0, 0.5, 0.0]), (5, [4.0, 3.0, 3.0])];
    let mut nodes = HashMap::new();
    let mut xyz = HashMap::new();
    for (id, p) in pts {
        xyz.insert(id, p);
        let [x, y, z] = r(p);
        nodes.insert(id.to_string(), SolverNode3D { id, x, y, z });
    }
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D { id: 1, name: None, a: 0.01, iy: 1e-4, iz: 1e-4, j: 2e-4, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None });
    sections.insert("2".to_string(), SolverSection3D { id: 2, name: None, a: 0.002, iy: 1e-6, iz: 1e-6, j: 2e-6, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None });
    let mut elements = HashMap::new();
    let mut next_node = 100;
    let mut next_elem = 1;
    let mut add = |t: &str, ni: usize, nj: usize, sec: usize, elements: &mut HashMap<String, SolverElement3D>| {
        elements.insert(next_elem.to_string(), SolverElement3D {
            id: next_elem, elem_type: t.to_string(), node_i: ni, node_j: nj, material_id: 1, section_id: sec,
            release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
            release_t_start: false, release_t_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
        next_elem += 1;
    };
    for (a, b) in [(1, 2), (2, 3), (3, 4), (3, 5)] {
        let (pa, pb) = (xyz[&a], xyz[&b]);
        let mut prev = a;
        for k in 1..=sub {
            let id = if k == sub { b } else {
                let t = k as f64 / sub as f64;
                let [x, y, z] = r([0, 1, 2].map(|i| pa[i] + t * (pb[i] - pa[i])));
                next_node += 1;
                nodes.insert(next_node.to_string(), SolverNode3D { id: next_node, x, y, z });
                next_node
            };
            add("frame", prev, id, 1, &mut elements);
            prev = id;
        }
    }
    let sup = |node_id: usize, fixed: bool, ry: bool, normal: Option<[f64; 3]>| SolverSupport3D {
        node_id, rx: fixed, ry: fixed || ry, rz: fixed, rrx: fixed, rry: fixed, rrz: fixed,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: normal.map(|n| n[0]), normal_y: normal.map(|n| n[1]), normal_z: normal.map(|n| n[2]),
        is_inclined: normal.map(|_| true), rw: None, kw: None,
    };
    let mut supports = HashMap::new();
    supports.insert("1".to_string(), sup(1, true, false, None));
    supports.insert("2".to_string(), if q.is_some() { sup(4, false, true, None) } else { sup(4, false, false, Some(normal)) });
    let loads = loads.iter().map(|&(node_id, f)| {
        let [fx, fy, fz] = r(f);
        SolverLoad3D::Nodal(SolverNodalLoad3D { node_id, fx, fy, fz, mx: 0.0, my: 0.0, mz: 0.0, bw: None })
    }).collect();
    SolverInput3D {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(), curved_beams: vec![],
        connectors: HashMap::new(), solver_options: None, masses: Default::default(),
    }
}

fn normal_3d() -> [f64; 3] {
    normalize([0.3, 0.8, 0.5])
}

fn q_3d() -> Mat3 {
    rotation_onto(normal_3d(), [0.0, 1.0, 0.0])
}

const LOADS_3D: [(usize, [f64; 3]); 3] = [(2, [5.0, 2.0, -400.0]), (3, [0.0, 3.0, -400.0]), (5, [1.0, 0.0, -50.0])];
/// Dense eigensolve (≤ 80 free DOFs) and sparse Lanczos.
const SUBS_3D: [usize; 2] = [1, 6];

/// Node → (u, θ) of the original model, turned into the reference model's axes.
fn rotated_3d(q: &Mat3, d: &[Displacement3D]) -> HashMap<usize, ([f64; 3], [f64; 3])> {
    d.iter().map(|d| (d.node_id, (mul3(q, [d.ux, d.uy, d.uz]), mul3(q, [d.rx, d.ry, d.rz])))).collect()
}

fn shape_pair_3d(q: &Mat3, a: &[Displacement3D], b: &[Displacement3D]) -> (Vec<f64>, Vec<f64>) {
    let ra = rotated_3d(q, a);
    let (mut va, mut vb) = (Vec::new(), Vec::new());
    for d in b {
        let (u, t) = ra[&d.node_id];
        va.extend_from_slice(&u);
        vb.extend_from_slice(&[d.ux, d.uy, d.uz]);
        if d.node_id != 6 {
            va.extend_from_slice(&t);
            vb.extend_from_slice(&[d.rx, d.ry, d.rz]);
        }
    }
    (va, vb)
}

#[test]
fn modal_3d_inclined_support_matches_rotated_model() {
    let q = q_3d();
    for sub in SUBS_3D {
        let a = modal::solve_modal_3d(&model_3d(normal_3d(), None, sub, &[]), &densities(), 5).expect("original");
        let b = modal::solve_modal_3d(&model_3d(normal_3d(), Some(&q), sub, &[]), &densities(), 5).expect("rotated");
        assert_eq!(a.modes.len(), b.modes.len());
        for (k, (ma, mb)) in a.modes.iter().zip(&b.modes).enumerate() {
            let what = format!("sub {sub} mode {k}");
            assert_close(&format!("{what} frequency"), ma.frequency, mb.frequency, mb.frequency, 1e-8);
            let (va, vb) = shape_pair_3d(&q, &ma.displacements, &mb.displacements);
            assert_same_shape(&what, &va, &vb, 1e-6);
            let ea = ma.effective_mass_x + ma.effective_mass_y + ma.effective_mass_z;
            let eb = mb.effective_mass_x + mb.effective_mass_y + mb.effective_mass_z;
            assert_close(&format!("{what} effective mass"), ea, eb, a.total_mass, 1e-8);
        }
        let cert = certify_modal_3d(&model_3d(normal_3d(), None, sub, &[]), &densities(), 3).expect("certify");
        assert!(cert.certificate.is_certified(), "sub {sub}: {:?}", cert.certificate);
    }
}

#[test]
fn buckling_3d_inclined_support_matches_rotated_model() {
    let q = q_3d();
    for sub in SUBS_3D {
        let a = buckling::solve_buckling_3d(&model_3d(normal_3d(), None, sub, &LOADS_3D), 3).expect("original");
        let b = buckling::solve_buckling_3d(&model_3d(normal_3d(), Some(&q), sub, &LOADS_3D), 3).expect("rotated");
        for (k, (ma, mb)) in a.modes.iter().zip(&b.modes).enumerate() {
            let what = format!("sub {sub} mode {k}");
            assert_close(&format!("{what} load factor"), ma.load_factor, mb.load_factor, mb.load_factor, 1e-8);
            let (va, vb) = shape_pair_3d(&q, &ma.displacements, &mb.displacements);
            assert_same_shape(&what, &va, &vb, 1e-5);
        }
        let cert = certify_buckling_3d(&model_3d(normal_3d(), None, sub, &LOADS_3D), 1).expect("certify");
        match cert.certificate {
            BucklingCertificate::Certified { lambda_lower, lambda_computed, .. } => {
                assert!(lambda_lower >= 0.999 * lambda_computed, "{lambda_lower} vs {lambda_computed}");
            }
            other => panic!("sub {sub}: buckling certificate not certified: {other:?}"),
        }
    }
}

#[test]
fn time_history_3d_inclined_support_matches_rotated_model() {
    let q = q_3d();
    for sub in SUBS_3D {
        let run = |rot: Option<&Mat3>| {
            let solver = model_3d(normal_3d(), rot, sub, &[]);
            let loads = model_3d(normal_3d(), rot, sub, &LOADS_3D).loads.iter().map(|l| match l {
                SolverLoad3D::Nodal(nl) => nl.clone(),
                _ => unreachable!(),
            }).collect();
            time_integration::solve_time_history_3d(&TimeHistoryInput3D {
                solver, densities: densities(), time_step: 0.002, n_steps: 120,
                method: "newmark".to_string(), beta: 0.25, gamma: 0.5, alpha: None, damping_xi: Some(0.05),
                ground_accel_x: None, ground_accel_y: None, ground_accel_z: None,
                force_history: Some(vec![TimeForceRecord3D { time: 0.0, loads: vec![] }, TimeForceRecord3D { time: 0.04, loads }]),
            }).expect("time history 3d")
        };
        let (a, b) = (run(None), run(Some(&q)));
        let hb: HashMap<usize, &NodeTimeHistory3D> = b.node_histories.iter().map(|h| (h.node_id, h)).collect();
        let mut scale = [0.0f64; 3];
        for h in &b.node_histories {
            for t in 0..h.ux.len() {
                scale[0] = scale[0].max(h.ux[t].abs()).max(h.uy[t].abs()).max(h.uz[t].abs());
                scale[1] = scale[1].max(h.vx[t].abs()).max(h.vy[t].abs()).max(h.vz[t].abs());
                scale[2] = scale[2].max(h.ax[t].abs()).max(h.ay[t].abs()).max(h.az[t].abs());
            }
        }
        assert!(scale[0] > 0.0);
        for ha in &a.node_histories {
            let hb = hb[&ha.node_id];
            for t in 0..ha.ux.len() {
                for (kind, s, va, vb) in [
                    ("u", scale[0], [ha.ux[t], ha.uy[t], ha.uz[t]], [hb.ux[t], hb.uy[t], hb.uz[t]]),
                    ("v", scale[1], [ha.vx[t], ha.vy[t], ha.vz[t]], [hb.vx[t], hb.vy[t], hb.vz[t]]),
                    ("a", scale[2], [ha.ax[t], ha.ay[t], ha.az[t]], [hb.ax[t], hb.ay[t], hb.az[t]]),
                ] {
                    let r = mul3(&q, va);
                    for i in 0..3 {
                        assert_close(&format!("sub {sub} node {} step {t} {kind}{i}", ha.node_id), r[i], vb[i], s, 1e-7);
                    }
                }
            }
        }
        let rb: HashMap<usize, &Reaction3D> = b.peak_reactions.iter().map(|r| (r.node_id, r)).collect();
        let r_scale = b.peak_reactions.iter().fold(0.0f64, |m, r| m.max(r.fx.abs()).max(r.fy.abs()).max(r.fz.abs()));
        for ra in &a.peak_reactions {
            let rb = rb[&ra.node_id];
            let (f, m) = (mul3(&q, [ra.fx, ra.fy, ra.fz]), mul3(&q, [ra.mx, ra.my, ra.mz]));
            for (i, (x, y)) in f.iter().chain(&m).zip([rb.fx, rb.fy, rb.fz, rb.mx, rb.my, rb.mz]).enumerate() {
                assert_close(&format!("sub {sub} reaction {} {i}", ra.node_id), *x, y, r_scale, 1e-6);
            }
        }
    }
}

#[test]
fn harmonic_3d_inclined_support_matches_rotated_model() {
    let q = q_3d();
    let axes = ["x", "y", "z"];
    for sub in SUBS_3D {
        for node in [3usize, 4] {
            let run = |rot: Option<&Mat3>, dof: &str| restrained_is_zero(solve_harmonic_3d(&HarmonicInput3D {
                solver: model_3d(normal_3d(), rot, sub, &LOADS_3D),
                densities: densities(),
                frequencies: FREQS.to_vec(),
                damping_ratio: 0.05,
                response_node_id: node,
                response_dof: dof.to_string(),
            }));
            let refs: Vec<_> = axes.iter().map(|d| run(Some(&q), d)).collect();
            for (i, dof) in axes.iter().enumerate() {
                // e_i·u = (Q e_i)·u_rot
                let a = run(None, dof);
                let w = [q[0][i], q[1][i], q[2][i]];
                let scale = a.response_points.iter().fold(0.0f64, |m, p| m.max(p.amplitude))
                    .max(refs.iter().flat_map(|r| &r.response_points).fold(0.0f64, |m, p| m.max(p.amplitude)));
                for (k, p) in a.response_points.iter().enumerate() {
                    let re: f64 = (0..3).map(|j| w[j] * refs[j].response_points[k].real).sum();
                    let im: f64 = (0..3).map(|j| w[j] * refs[j].response_points[k].imag).sum();
                    let what = format!("sub {sub} node {node} {dof} f {}", p.frequency);
                    assert_close(&format!("{what} re"), p.real, re, scale, 1e-6);
                    assert_close(&format!("{what} im"), p.imag, im, scale, 1e-6);
                }
            }
        }
    }
}

#[test]
fn spectral_3d_inclined_support_matches_rotated_model() {
    // A quarter turn about Z maps X onto Y (see the 2D test): the inclined
    // support's normal is X in the original, a plain ry in the reference.
    let q: Mat3 = [[0.0, -1.0, 0.0], [1.0, 0.0, 0.0], [0.0, 0.0, 1.0]];
    let normal = [1.0, 0.0, 0.0];
    for sub in SUBS_3D {
        let run = |rot: Option<&Mat3>, direction: &str| {
            let solver = model_3d(normal, rot, sub, &[]);
            let m = modal::solve_modal_3d(&solver, &densities(), 4).expect("modal");
            let modes = m.modes.iter().map(|m| SpectralModeInput3D {
                frequency: m.frequency, period: m.period, omega: m.omega,
                displacements: m.displacements.iter().map(|d| SpectralModeDisp3D {
                    node_id: d.node_id, ux: d.ux, uy: d.uy, uz: d.uz, rx: d.rx, ry: d.ry, rz: d.rz,
                }).collect(),
                participation_x: m.participation_x, participation_y: m.participation_y, participation_z: m.participation_z,
                effective_mass_x: m.effective_mass_x, effective_mass_y: m.effective_mass_y, effective_mass_z: m.effective_mass_z,
            }).collect();
            spectral::solve_spectral_3d(&SpectralInput3D {
                solver, modes, densities: densities(), spectrum: spectrum(), direction: direction.into(),
                rule: Some("CQC".into()), xi: Some(0.05), importance_factor: None, reduction_factor: None, total_mass: None,
            }).expect("spectral 3d")
        };
        let (a, b) = (run(None, "X"), run(Some(&q), "Y"));
        assert_close("base shear", a.base_shear, b.base_shear, b.base_shear, 1e-8);
        let fb: HashMap<usize, &spectral::SpectralElementForce3D> = b.element_forces.iter().map(|f| (f.element_id, f)).collect();
        let scale = b.element_forces.iter().fold(0.0f64, |m, f| {
            [f.n_max, f.vy_max, f.vz_max, f.mx_max, f.my_max, f.mz_max].into_iter().fold(m, f64::max)
        });
        for fa in &a.element_forces {
            let fb = fb[&fa.element_id];
            let what = format!("sub {sub} element {}", fa.element_id);
            // Axial force and torsion do not depend on the member's local
            // y/z axes; the shear and moment resultants do, so compare their
            // pairs' norms' bounds: each envelope of the pair must agree as a set.
            assert_close(&format!("{what} N"), fa.n_max, fb.n_max, scale, 1e-6);
            assert_close(&format!("{what} T"), fa.mx_max, fb.mx_max, scale, 1e-6);
            let (va, vb) = (fa.vy_max.max(fa.vz_max), fb.vy_max.max(fb.vz_max));
            assert_close(&format!("{what} V"), va, vb, scale, 1e-6);
            let (ma, mb) = (fa.my_max.max(fa.mz_max), fb.my_max.max(fb.mz_max));
            assert_close(&format!("{what} M"), ma, mb, scale, 1e-6);
        }
    }
}

#[test]
fn craig_bampton_3d_inclined_support_matches_rotated_model() {
    let q = q_3d();
    for sub in SUBS_3D {
        let run = |rot: Option<&Mat3>| craig_bampton_3d(&CraigBamptonInput3D {
            solver: model_3d(normal_3d(), rot, sub, &[]), boundary_nodes: vec![2], n_modes: 4, densities: densities(),
        }).expect("craig-bampton 3d");
        assert_cb_same(&format!("sub {sub}"), &run(None), &run(Some(&q)));
    }
}

#[test]
fn pdelta_3d_inclined_support_matches_rotated_model() {
    let q = q_3d();
    for sub in SUBS_3D {
        let a = pdelta::solve_pdelta_3d(&model_3d(normal_3d(), None, sub, &LOADS_3D), 30, 1e-10).expect("original");
        let b = pdelta::solve_pdelta_3d(&model_3d(normal_3d(), Some(&q), sub, &LOADS_3D), 30, 1e-10).expect("rotated");
        let ra = rotated_3d(&q, &a.results.displacements);
        let scale = b.results.displacements.iter().fold(0.0f64, |m, d| m.max(d.ux.abs()).max(d.uy.abs()).max(d.uz.abs()));
        for d in &b.results.displacements {
            let (u, t) = ra[&d.node_id];
            for (i, v) in [d.ux, d.uy, d.uz].into_iter().enumerate() {
                assert_close(&format!("sub {sub} node {} u{i}", d.node_id), u[i], v, scale, 1e-7);
            }
            if d.node_id != 6 {
                for (i, v) in [d.rx, d.ry, d.rz].into_iter().enumerate() {
                    assert_close(&format!("sub {sub} node {} r{i}", d.node_id), t[i], v, scale, 1e-7);
                }
            }
        }
        let rb: HashMap<usize, &Reaction3D> = b.results.reactions.iter().map(|r| (r.node_id, r)).collect();
        let r_scale = b.results.reactions.iter().fold(0.0f64, |m, r| m.max(r.fx.abs()).max(r.fy.abs()).max(r.fz.abs()));
        for ra in &a.results.reactions {
            let rb = rb[&ra.node_id];
            let (f, m) = (mul3(&q, [ra.fx, ra.fy, ra.fz]), mul3(&q, [ra.mx, ra.my, ra.mz]));
            for (i, (x, y)) in f.iter().chain(&m).zip([rb.fx, rb.fy, rb.fz, rb.mx, rb.my, rb.mz]).enumerate() {
                assert_close(&format!("sub {sub} reaction {} {i}", ra.node_id), *x, y, r_scale, 1e-7);
            }
        }
    }
}

// ─── static nonlinear paths ────────────────────────────────────────────────
//
// These keep the displacement in global axes for the elements and solve each
// step in the support frames (or, for the ones that did not, used to mix the
// two). Staged construction refuses inclined supports outright, so it is not
// here. The 3D co-rotational solver did not converge on this frame before
// #297; it does now and is tested at the end of the file.

fn assert_static_2d(what: &str, a: &AnalysisResults, b: &AnalysisResults, rel: f64) {
    let ra = rotated_2d(THETA, &a.displacements);
    let scale = b.displacements.iter().fold(0.0f64, |m, d| m.max(d.ux.abs()).max(d.uz.abs()));
    assert!(scale > 0.0, "{what}: no displacement");
    for d in &b.displacements {
        let x = ra[&d.node_id];
        assert_close(&format!("{what} node {} ux", d.node_id), x[0], d.ux, scale, rel);
        assert_close(&format!("{what} node {} uz", d.node_id), x[1], d.uz, scale, rel);
        if d.node_id != 5 && d.node_id != 6 {
            assert_close(&format!("{what} node {} ry", d.node_id), x[2], d.ry, scale, rel);
        }
    }
    let rb: HashMap<usize, &Reaction> = b.reactions.iter().map(|r| (r.node_id, r)).collect();
    let r_scale = b.reactions.iter().fold(0.0f64, |m, r| m.max(r.rx.abs()).max(r.rz.abs()).max(r.my.abs()));
    for r in &a.reactions {
        let Some(rb) = rb.get(&r.node_id) else { panic!("{what}: no reaction at {}", r.node_id) };
        let (rx, rz) = rot2(THETA, r.rx, r.rz);
        assert_close(&format!("{what} reaction {} rx", r.node_id), rx, rb.rx, r_scale, rel);
        assert_close(&format!("{what} reaction {} rz", r.node_id), rz, rb.rz, r_scale, rel);
        assert_close(&format!("{what} reaction {} my", r.node_id), r.my, rb.my, r_scale, rel);
    }
}

fn json_input<T: serde::de::DeserializeOwned>(solver: SolverInput, extra: serde_json::Value) -> T {
    let mut v = extra;
    v["solver"] = serde_json::to_value(solver).unwrap();
    serde_json::from_value(v).unwrap()
}

/// The portal alone (no truss-only nodes, which these tangents do not guard).
fn portal_2d(rotated: bool, sub: usize) -> SolverInput {
    let mut m = model_2d(THETA, rotated, sub, &LOADS_2D_NL[..2]);
    m.elements.retain(|_, e| e.elem_type == "frame");
    m.nodes.retain(|_, n| n.id != 5 && n.id != 6);
    m.supports.retain(|_, s| s.node_id != 6);
    m
}

const LOADS_2D_NL: [(usize, f64, f64); 3] = [(2, 2.0, -30.0), (3, 0.0, -30.0), (5, 1.0, -4.0)];

#[test]
fn corotational_2d_inclined_roller_matches_rotated_model() {
    use dedaliano_engine::solver::corotational::solve_corotational_2d;
    for sub in SUBS {
        // 1e-8: on the subdivided (sparse) portal the increment norm stalls on
        // roundoff just above 1e-10, and since fix/nonlinear-solvers an
        // unconverged solve reports the last converged increment (none here:
        // zero displacements) instead of the abandoned iterate.
        let a = solve_corotational_2d(&portal_2d(false, sub), 50, 1e-8, 5, false).expect("a");
        let b = solve_corotational_2d(&portal_2d(true, sub), 50, 1e-8, 5, false).expect("b");
        assert!(a.converged && b.converged, "corotational sub {sub}: converged {} {}", a.converged, b.converged);
        assert_static_2d(&format!("corotational sub {sub}"), &a.results, &b.results, 1e-6);
    }
}

#[test]
fn arc_length_2d_inclined_roller_matches_rotated_model() {
    use dedaliano_engine::solver::arc_length::{solve_arc_length, ArcLengthInput};
    for sub in SUBS {
        // One step: later steps adapt the arc length to iteration counts (which
        // roundoff can tip by one), so the two runs may take different paths.
        let run = |rot: bool| solve_arc_length(&json_input::<ArcLengthInput>(portal_2d(rot, sub), serde_json::json!({"maxSteps": 1, "maxIter": 30, "initialDs": 0.5, "maxDs": 2.0, "minDs": 1e-6, "targetIter": 5, "tolerance": 1e-7}))).expect("arc");
        let (a, b) = (run(false), run(true));
        assert!(a.converged && b.converged && !a.steps.is_empty(), "{} {} {:?}", a.converged, b.converged, a.steps.iter().map(|s| (s.load_factor, s.iterations)).collect::<Vec<_>>());
        assert_close("load factor", a.final_load_factor, b.final_load_factor, b.final_load_factor, 1e-7);
        assert_static_2d(&format!("arc length sub {sub}"), &a.results, &b.results, 1e-6);
    }
}

#[test]
fn material_nonlinear_2d_inclined_roller_matches_rotated_model() {
    use dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_2d;
    for sub in SUBS {
        let run = |rot: bool| solve_nonlinear_material_2d(&json_input::<NonlinearMaterialInput>(portal_2d(rot, sub), serde_json::json!({"materialModels": {}, "sectionCapacities": {}, "maxIter": 50, "tolerance": 1e-10, "nIncrements": 3}))).expect("mn");
        let (a, b) = (run(false), run(true));
        assert_static_2d(&format!("material nonlinear sub {sub}"), &a.results, &b.results, 1e-6);
    }
}

#[test]
fn contact_2d_inclined_roller_matches_rotated_model() {
    use dedaliano_engine::solver::contact::{solve_contact_2d, ContactInput};
    for sub in SUBS {
        let run = |rot: bool| solve_contact_2d(&json_input::<ContactInput>(portal_2d(rot, sub), serde_json::json!({}))).expect("contact");
        let (a, b) = (run(false), run(true));
        assert_static_2d(&format!("contact sub {sub}"), &a.results, &b.results, 1e-6);
    }
}

#[test]
fn ssi_2d_inclined_roller_matches_rotated_model() {
    use dedaliano_engine::solver::ssi::{solve_ssi_2d, SSIInput};
    for sub in SUBS {
        let run = |rot: bool| solve_ssi_2d(&json_input::<SSIInput>(portal_2d(rot, sub), serde_json::json!({"soilSprings": [], "maxIter": 30, "tolerance": 1e-10}))).expect("ssi");
        let (a, b) = (run(false), run(true));
        assert_static_2d(&format!("ssi sub {sub}"), &a.results, &b.results, 1e-6);
    }
}

#[test]
fn fiber_2d_inclined_roller_matches_rotated_model() {
    use dedaliano_engine::solver::fiber_nonlinear::{solve_fiber_nonlinear_2d, FiberNonlinearInput};
    for sub in SUBS {
        let run = |rot: bool| solve_fiber_nonlinear_2d(&json_input::<FiberNonlinearInput>(portal_2d(rot, sub), serde_json::json!({"fiberSections": {}, "nIntegrationPoints": 3, "maxIter": 50, "tolerance": 1e-10, "nIncrements": 3, "modifiedNr": false}))).expect("fiber");
        let (a, b) = (run(false), run(true));
        assert_static_2d(&format!("fiber sub {sub}"), &a.results, &b.results, 1e-6);
    }
}

#[test]
fn winkler_2d_inclined_roller_matches_rotated_model() {
    use dedaliano_engine::solver::winkler::{solve_winkler_2d, WinklerInput};
    for sub in SUBS {
        let run = |rot: bool| solve_winkler_2d(&WinklerInput { solver: portal_2d(rot, sub), foundation_springs: vec![] }).expect("winkler");
        let (a, b) = (run(false), run(true));
        assert_static_2d(&format!("winkler sub {sub}"), &a, &b, 1e-6);
    }
}

fn assert_static_3d(what: &str, q: &Mat3, a: &AnalysisResults3D, b: &AnalysisResults3D, rel: f64) {
    let ra = rotated_3d(q, &a.displacements);
    let scale = b.displacements.iter().fold(0.0f64, |m, d| m.max(d.ux.abs()).max(d.uy.abs()).max(d.uz.abs()));
    assert!(scale > 0.0, "{what}: no displacement");
    for d in &b.displacements {
        let (u, t) = ra[&d.node_id];
        for (i, (x, y)) in u.iter().chain(&t).zip([d.ux, d.uy, d.uz, d.rx, d.ry, d.rz]).enumerate() {
            assert_close(&format!("{what} node {} dof {i}", d.node_id), *x, y, scale, rel);
        }
    }
    let rb: HashMap<usize, &Reaction3D> = b.reactions.iter().map(|r| (r.node_id, r)).collect();
    let r_scale = b.reactions.iter().fold(0.0f64, |m, r| m.max(r.fx.abs()).max(r.fy.abs()).max(r.fz.abs()));
    for ra in &a.reactions {
        let Some(rb) = rb.get(&ra.node_id) else { panic!("{what}: no reaction at {}", ra.node_id) };
        let (f, m) = (mul3(q, [ra.fx, ra.fy, ra.fz]), mul3(q, [ra.mx, ra.my, ra.mz]));
        for (i, (x, y)) in f.iter().chain(&m).zip([rb.fx, rb.fy, rb.fz, rb.mx, rb.my, rb.mz]).enumerate() {
            assert_close(&format!("{what} reaction {} {i}", ra.node_id), *x, y, r_scale, rel);
        }
    }
}

fn json_input_3d<T: serde::de::DeserializeOwned>(solver: SolverInput3D, extra: serde_json::Value) -> T {
    let mut v = extra;
    v["solver"] = serde_json::to_value(solver).unwrap();
    serde_json::from_value(v).unwrap()
}

const LOADS_3D_NL: [(usize, [f64; 3]); 2] = [(2, [1.0, 0.5, -40.0]), (3, [0.0, 0.8, -40.0])];

fn frame_3d(rot: Option<&Mat3>, sub: usize) -> SolverInput3D {
    model_3d(normal_3d(), rot, sub, &LOADS_3D_NL)
}

#[test]
fn material_nonlinear_3d_inclined_support_matches_rotated_model() {
    use dedaliano_engine::solver::material_nonlinear::solve_nonlinear_material_3d;
    let q = q_3d();
    for sub in SUBS_3D {
        let run = |rot: Option<&Mat3>| solve_nonlinear_material_3d(&json_input_3d::<NonlinearMaterialInput3D>(frame_3d(rot, sub), serde_json::json!({"materialModels": {}, "sectionCapacities": {}, "maxIter": 50, "tolerance": 1e-10, "nIncrements": 3}))).expect("mn 3d");
        assert_static_3d(&format!("material nonlinear sub {sub}"), &q, &run(None).results, &run(Some(&q)).results, 1e-6);
    }
}

#[test]
fn fiber_3d_inclined_support_matches_rotated_model() {
    use dedaliano_engine::solver::fiber_nonlinear::{solve_fiber_nonlinear_3d, FiberNonlinearInput3D};
    let q = q_3d();
    for sub in SUBS_3D {
        let run = |rot: Option<&Mat3>| solve_fiber_nonlinear_3d(&json_input_3d::<FiberNonlinearInput3D>(frame_3d(rot, sub), serde_json::json!({"fiberSections": {}, "nIntegrationPoints": 3, "maxIter": 50, "tolerance": 1e-10, "nIncrements": 3, "modifiedNr": false}))).expect("fiber 3d");
        assert_static_3d(&format!("fiber sub {sub}"), &q, &run(None).results, &run(Some(&q)).results, 1e-6);
    }
}

#[test]
fn contact_3d_inclined_support_matches_rotated_model() {
    use dedaliano_engine::solver::contact::{solve_contact_3d, ContactInput3D};
    let q = q_3d();
    for sub in SUBS_3D {
        let run = |rot: Option<&Mat3>| solve_contact_3d(&json_input_3d::<ContactInput3D>(frame_3d(rot, sub), serde_json::json!({}))).expect("contact 3d");
        assert_static_3d(&format!("contact sub {sub}"), &q, &run(None).results, &run(Some(&q)).results, 1e-6);
    }
}

#[test]
fn ssi_3d_inclined_support_matches_rotated_model() {
    use dedaliano_engine::solver::ssi::{solve_ssi_3d, SSIInput3D};
    let q = q_3d();
    for sub in SUBS_3D {
        let run = |rot: Option<&Mat3>| solve_ssi_3d(&json_input_3d::<SSIInput3D>(frame_3d(rot, sub), serde_json::json!({"soilSprings": [], "maxIter": 30, "tolerance": 1e-10}))).expect("ssi 3d");
        assert_static_3d(&format!("ssi sub {sub}"), &q, &run(None).results, &run(Some(&q)).results, 1e-6);
    }
}

#[test]
fn winkler_3d_inclined_support_matches_rotated_model() {
    use dedaliano_engine::solver::winkler::{solve_winkler_3d, WinklerInput3D};
    let q = q_3d();
    for sub in SUBS_3D {
        let run = |rot: Option<&Mat3>| solve_winkler_3d(&WinklerInput3D { solver: frame_3d(rot, sub), foundation_springs: vec![] }).expect("winkler 3d");
        assert_static_3d(&format!("winkler sub {sub}"), &q, &run(None), &run(Some(&q)), 1e-6);
    }
}


/// The 3D co-rotational solver did not converge on this frame before #297
/// (#287 and #302 left it out for that reason, even with a plain support).
/// With #297's rewrite (exact rigid rotation, frame carried by the end
/// rotations) it converges, and the inclined support matches the rotated model.
#[test]
fn corotational_3d_inclined_support_matches_rotated_model() {
    use dedaliano_engine::solver::corotational::solve_corotational_3d;
    let q = q_3d();
    for sub in SUBS_3D {
        let a = solve_corotational_3d(&frame_3d(None, sub), 50, 1e-8, 4, false).expect("a");
        let b = solve_corotational_3d(&frame_3d(Some(&q), sub), 50, 1e-8, 4, false).expect("b");
        assert!(a.converged && b.converged, "corotational 3d sub {sub}: converged {} {}", a.converged, b.converged);
        assert_static_3d(&format!("corotational 3d sub {sub}"), &q, &a.results, &b.results, 1e-6);
    }
}
