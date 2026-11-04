//! Regressions: 2D buckling and 2D time integration on a frame with an
//! inclined roller, an angled spring and truss-only nodes.
//!
//! Both analyses used to assemble K with `assemble_sparse_2d_ex`, which
//! ignored the inclined roller and the spring angle and left the truss-only
//! nodes' rotation DOFs singular. The reference is the same structure rotated
//! rigidly so that the roller becomes a rollerX and the spring axis-aligned
//! (no inclined frame, no rotated spring block): buckling factors are
//! invariant under the rotation, and displacements, velocities, accelerations
//! and reactions rotate with it. Time integration is also checked against the
//! linear static solution it settles to.

use dedaliano_engine::certify::buckling::{certify_buckling_2d, BucklingCertificate};
use dedaliano_engine::solver::{buckling, linear, time_integration};
use dedaliano_engine::types::*;
use std::collections::HashMap;

/// Roller angle; the spring is at −THETA so that rotating the model by
/// +THETA aligns both with the global axes.
const THETA: f64 = 0.5;

/// Rotate (x, z) by +THETA (counter-clockwise in the x–z plane).
fn rot(x: f64, z: f64) -> (f64, f64) {
    let (s, c) = THETA.sin_cos();
    (c * x - s * z, s * x + c * z)
}

/// Portal frame 1-2-3-4 (fixed base at 1, inclined roller at 4) with a truss
/// branch 3-5-6 ending on a translational spring at 6. Nodes 5 and 6 are
/// reached only by trusses, so their rotations are orphan DOFs. `rotated`
/// builds the same structure turned by +THETA, with a rollerX at 4 and an
/// unangled spring at 6.
fn model(rotated: bool, loads: &[(usize, f64, f64)]) -> SolverInput {
    let pts = [(1, 0.0, 0.0), (2, 0.0, 4.0), (3, 5.0, 4.0), (4, 5.0, 0.0), (5, 8.0, 6.0), (6, 10.0, 4.0)];
    let mut nodes = HashMap::new();
    for (id, x, z) in pts {
        let (x, z) = if rotated { rot(x, z) } else { (x, z) };
        nodes.insert(id.to_string(), SolverNode { id, x, z });
    }
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });
    sections.insert("2".to_string(), SolverSection { id: 2, a: 0.002, iz: 1e-6, as_y: None });
    let mut elements = HashMap::new();
    for (id, t, ni, nj, sec) in [(1, "frame", 1, 2, 1), (2, "frame", 2, 3, 1), (3, "frame", 3, 4, 1), (4, "truss", 3, 5, 2), (5, "truss", 5, 6, 2)] {
        elements.insert(id.to_string(), SolverElement {
            id, elem_type: t.to_string(), node_i: ni, node_j: nj,
            material_id: 1, section_id: sec, hinge_start: false, hinge_end: false,
        });
    }
    let sup = |id: usize, node_id: usize, t: &str, k: Option<(f64, f64)>, angle: Option<f64>| SolverSupport {
        id, node_id, support_type: t.to_string(),
        kx: k.map(|k| k.0), ky: k.map(|k| k.1), kz: None, dx: None, dz: None, dry: None, angle,
    };
    let mut supports = HashMap::new();
    supports.insert("1".to_string(), sup(1, 1, "fixed", None, None));
    supports.insert("2".to_string(), if rotated {
        sup(2, 4, "rollerX", None, None)
    } else {
        sup(2, 4, "inclinedRoller", None, Some(THETA))
    });
    supports.insert("3".to_string(), sup(3, 6, "spring", Some((5e3, 2e4)), if rotated { None } else { Some(-THETA) }));
    let loads = loads.iter().map(|&(node_id, fx, fz)| {
        let (fx, fz) = if rotated { rot(fx, fz) } else { (fx, fz) };
        SolverLoad::Nodal(SolverNodalLoad { node_id, fx, fz, my: 0.0 })
    }).collect();
    SolverInput {
        nodes, materials, sections, elements, supports, loads,
        constraints: vec![], connectors: HashMap::new(), solver_options: None, masses: Default::default(),
    }
}

const LOADS: [(usize, f64, f64); 3] = [(2, 10.0, -300.0), (3, 0.0, -300.0), (5, 5.0, -20.0)];

/// Node → (ux, uz, ry) of the original model, turned into the rotated model's axes.
fn rotated_disp(d: &[Displacement]) -> HashMap<usize, [f64; 3]> {
    d.iter().map(|d| {
        let (x, z) = rot(d.ux, d.uz);
        (d.node_id, [x, z, d.ry])
    }).collect()
}

fn assert_close(what: &str, a: f64, b: f64, scale: f64, rel: f64) {
    assert!((a - b).abs() <= rel * scale.max(1e-300), "{what}: {a} vs {b} (scale {scale})");
}

#[test]
fn buckling_2d_inclined_roller_angled_spring_orphan_rotation() {
    let orig = buckling::solve_buckling_2d(&model(false, &LOADS), 3).expect("original model");
    let reference = buckling::solve_buckling_2d(&model(true, &LOADS), 3).expect("rotated model");
    assert_eq!(orig.modes.len(), reference.modes.len());
    for (k, (a, b)) in orig.modes.iter().zip(&reference.modes).enumerate() {
        assert_close(&format!("load factor {k}"), a.load_factor, b.load_factor, b.load_factor, 1e-8);

        // Mode shapes agree up to scale and sign (each is normalized to its
        // largest global component, which a rotation changes). The truss-only
        // nodes' rotations are excluded: no element gives them a meaning.
        let ra = rotated_disp(&a.displacements);
        let mut va = Vec::new();
        let mut vb = Vec::new();
        for d in &b.displacements {
            let x = ra[&d.node_id];
            let n = if d.node_id >= 5 { 2 } else { 3 };
            va.extend_from_slice(&x[..n]);
            vb.extend_from_slice(&[d.ux, d.uz, d.ry][..n]);
        }
        let s = va.iter().zip(&vb).map(|(p, q)| p * q).sum::<f64>() / va.iter().map(|p| p * p).sum::<f64>();
        let scale = vb.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        for (i, (p, q)) in va.iter().zip(&vb).enumerate() {
            assert_close(&format!("mode {k} component {i}"), s * p, *q, scale, 1e-5);
        }
    }

    // The buckling certificate encloses the same factor, in the inclined frames.
    let cert = certify_buckling_2d(&model(false, &LOADS), 1).expect("certify");
    match cert.certificate {
        BucklingCertificate::Certified { lambda_lower, lambda_computed, .. } => {
            assert!(lambda_lower <= lambda_computed * (1.0 + 1e-9), "{lambda_lower} > {lambda_computed}");
            assert!(lambda_lower >= 0.999 * lambda_computed, "{lambda_lower} vs {lambda_computed}");
        }
        other => panic!("buckling certificate not certified: {other:?}"),
    }
}

fn th_input(solver: SolverInput, force_history: Option<Vec<TimeForceRecord>>, ground: Option<(&str, Vec<f64>)>, xi: f64, n_steps: usize) -> TimeHistoryInput {
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);
    TimeHistoryInput {
        solver, densities, time_step: 0.002, n_steps,
        method: "newmark".to_string(), beta: 0.25, gamma: 0.5, alpha: None,
        damping_xi: Some(xi),
        ground_direction: ground.as_ref().map(|g| g.0.to_string()),
        ground_accel: ground.map(|g| g.1),
        force_history,
    }
}

/// Every recorded history and the peak reactions of `a` (original model),
/// rotated, equal those of `b` (rotated model).
fn assert_histories_rotate(a: &TimeHistoryResult, b: &TimeHistoryResult) {
    let hb: HashMap<usize, &NodeTimeHistory> = b.node_histories.iter().map(|h| (h.node_id, h)).collect();
    let mut u_scale = 0.0f64;
    let mut v_scale = 0.0f64;
    let mut a_scale = 0.0f64;
    for h in &b.node_histories {
        for t in 0..h.ux.len() {
            u_scale = u_scale.max(h.ux[t].abs()).max(h.uz[t].abs());
            v_scale = v_scale.max(h.vx[t].abs()).max(h.vz[t].abs());
            a_scale = a_scale.max(h.ax[t].abs()).max(h.az[t].abs());
        }
    }
    assert!(u_scale > 0.0);
    for ha in &a.node_histories {
        let hb = hb[&ha.node_id];
        for t in 0..ha.ux.len() {
            let what = format!("node {} step {t}", ha.node_id);
            let (ux, uz) = rot(ha.ux[t], ha.uz[t]);
            assert_close(&format!("{what} ux"), ux, hb.ux[t], u_scale, 1e-7);
            assert_close(&format!("{what} uz"), uz, hb.uz[t], u_scale, 1e-7);
            if ha.node_id < 5 {
                assert_close(&format!("{what} ry"), ha.ry[t], hb.ry[t], u_scale, 1e-7);
            }
            let (vx, vz) = rot(ha.vx[t], ha.vz[t]);
            assert_close(&format!("{what} vx"), vx, hb.vx[t], v_scale, 1e-7);
            assert_close(&format!("{what} vz"), vz, hb.vz[t], v_scale, 1e-7);
            let (ax, az) = rot(ha.ax[t], ha.az[t]);
            assert_close(&format!("{what} ax"), ax, hb.ax[t], a_scale, 1e-7);
            assert_close(&format!("{what} az"), az, hb.az[t], a_scale, 1e-7);
        }
    }
    let rb: HashMap<usize, &Reaction> = b.peak_reactions.iter().map(|r| (r.node_id, r)).collect();
    let r_scale = b.peak_reactions.iter().fold(0.0f64, |m, r| m.max(r.rx.abs()).max(r.rz.abs()).max(r.my.abs()));
    assert_eq!(a.peak_reactions.len(), b.peak_reactions.len());
    for ra in &a.peak_reactions {
        let rb = rb[&ra.node_id];
        let (rx, rz) = rot(ra.rx, ra.rz);
        assert_close(&format!("node {} reaction rx", ra.node_id), rx, rb.rx, r_scale, 1e-7);
        assert_close(&format!("node {} reaction rz", ra.node_id), rz, rb.rz, r_scale, 1e-7);
        assert_close(&format!("node {} reaction my", ra.node_id), ra.my, rb.my, r_scale, 1e-7);
    }
}

#[test]
fn time_history_2d_force_history_inclined_roller_angled_spring_orphan_rotation() {
    let history = |rotated: bool| {
        let loads = model(rotated, &LOADS).loads.iter().map(|l| match l {
            SolverLoad::Nodal(nl) => nl.clone(),
            _ => unreachable!(),
        }).collect::<Vec<_>>();
        vec![
            TimeForceRecord { time: 0.0, loads: vec![] },
            TimeForceRecord { time: 0.05, loads },
        ]
    };
    let a = time_integration::solve_time_history_2d(&th_input(model(false, &[]), Some(history(false)), None, 0.05, 200)).expect("original");
    let b = time_integration::solve_time_history_2d(&th_input(model(true, &[]), Some(history(true)), None, 0.05, 200)).expect("rotated");
    assert_histories_rotate(&a, &b);
}

#[test]
fn time_history_2d_ground_accel_inclined_roller_angled_spring_orphan_rotation() {
    // Ground motion along global X in the original model is, in the rotated
    // model, along (cos θ, sin θ): the sum of an X run scaled by cos θ and a
    // Y run scaled by sin θ (the system is linear and starts at rest).
    let g: Vec<f64> = (0..=150).map(|i| (i as f64 * 0.002 * 40.0).sin() * 2.0).collect();
    let (s, c) = THETA.sin_cos();
    let a = time_integration::solve_time_history_2d(&th_input(model(false, &[]), None, Some(("X", g.clone())), 0.05, 150)).expect("original");
    let bx = time_integration::solve_time_history_2d(&th_input(model(true, &[]), None, Some(("X", g.iter().map(|v| v * c).collect())), 0.05, 150)).expect("rotated X");
    let by = time_integration::solve_time_history_2d(&th_input(model(true, &[]), None, Some(("Y", g.iter().map(|v| v * s).collect())), 0.05, 150)).expect("rotated Y");
    let mut b = bx.clone();
    for (hb, hy) in b.node_histories.iter_mut().zip(&by.node_histories) {
        assert_eq!(hb.node_id, hy.node_id);
        for (dst, src) in [
            (&mut hb.ux, &hy.ux), (&mut hb.uz, &hy.uz), (&mut hb.ry, &hy.ry),
            (&mut hb.vx, &hy.vx), (&mut hb.vz, &hy.vz), (&mut hb.ax, &hy.ax), (&mut hb.az, &hy.az),
        ] {
            for (d, s) in dst.iter_mut().zip(src) {
                *d += s;
            }
        }
    }
    // Peak reactions are taken at each run's own peak, so they do not
    // superpose; compare the histories only.
    b.peak_reactions = vec![];
    let mut a = a;
    a.peak_reactions = vec![];
    assert_histories_rotate(&a, &b);
}

#[test]
fn time_history_2d_static_loads_settle_to_linear_solution() {
    // Static loads applied suddenly, heavily damped: the response settles to
    // the linear static solution (dense/linear sparse path) in global axes.
    let input = model(false, &LOADS);
    let lin = linear::solve_2d(&input).expect("linear");
    let th = time_integration::solve_time_history_2d(&th_input(input, None, None, 1.0, 4000)).expect("time history");
    let scale = lin.displacements.iter().fold(0.0f64, |m, d| m.max(d.ux.abs()).max(d.uz.abs()));
    for d in &lin.displacements {
        let h = th.node_histories.iter().find(|h| h.node_id == d.node_id).unwrap();
        let last = h.ux.len() - 1;
        assert_close(&format!("node {} ux", d.node_id), h.ux[last], d.ux, scale, 1e-5);
        assert_close(&format!("node {} uz", d.node_id), h.uz[last], d.uz, scale, 1e-5);
        if d.node_id < 5 {
            assert_close(&format!("node {} ry", d.node_id), h.ry[last], d.ry, scale, 1e-5);
        }
    }
    // Peak reactions (at the largest displacement, which a damped step
    // response reaches as it settles) match the static reactions, the angled
    // spring's and the inclined roller's included.
    let r_scale = lin.reactions.iter().fold(0.0f64, |m, r| m.max(r.rx.abs()).max(r.rz.abs()).max(r.my.abs()));
    assert_eq!(th.peak_reactions.len(), lin.reactions.len());
    for r in &lin.reactions {
        let p = th.peak_reactions.iter().find(|p| p.node_id == r.node_id).unwrap();
        assert_close(&format!("node {} rx", r.node_id), p.rx, r.rx, r_scale, 1e-3);
        assert_close(&format!("node {} rz", r.node_id), p.rz, r.rz, r_scale, 1e-3);
        assert_close(&format!("node {} my", r.node_id), p.my, r.my, r_scale, 1e-3);
    }
}

// ─── the same frame mismatch in analyses beside `assemble_sparse_2d_ex` ─────
//
// K came out rotated into the support frame, but the mass / geometric
// stiffness beside it and the reported shapes were not rotated. Fixed in
// each analysis; `inclined_support_analyses.rs` covers them all.

/// 2D modal paired the rotated K (inclined roller) with an unrotated mass and
/// reported the mode shape in the roller frame, so the frequencies of the
/// original and the rigidly rotated model differed.
#[test]
fn modal_2d_inclined_roller_rotation_invariance() {
    let mut densities = HashMap::new();
    densities.insert("1".to_string(), 7850.0);
    // The portal alone (the full model, truss-only nodes included, is in
    // `inclined_support_analyses.rs`).
    let portal = |rotated: bool| {
        let mut m = model(rotated, &[]);
        m.elements.retain(|_, e| e.elem_type == "frame");
        m.nodes.retain(|_, n| n.id <= 4);
        m.supports.retain(|_, s| s.node_id <= 4);
        m
    };
    let a = dedaliano_engine::solver::modal::solve_modal_2d(&portal(false), &densities, 4).expect("original");
    let b = dedaliano_engine::solver::modal::solve_modal_2d(&portal(true), &densities, 4).expect("rotated");
    for (k, (ma, mb)) in a.modes.iter().zip(&b.modes).enumerate() {
        assert_close(&format!("frequency {k}"), ma.frequency, mb.frequency, mb.frequency, 1e-8);
    }
}

/// 3D cantilever column along Z (fixed base), top node restrained in Y only:
/// by an inclined support with normal (0, 1, 0), or by a plain `ry` flag.
fn column_3d(inclined: bool) -> SolverInput3D {
    let mut nodes = HashMap::new();
    for (id, z) in [(1, 0.0), (2, 2.0), (3, 4.0)] {
        nodes.insert(id.to_string(), SolverNode3D { id, x: 0.0, y: 0.0, z });
    }
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: 200_000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection3D { id: 1, name: None, a: 0.01, iy: 1e-4, iz: 1e-4, j: 2e-4, cw: None, as_y: None, as_z: None, shear_center_y: None, shear_center_z: None });
    let mut elements = HashMap::new();
    for (id, ni, nj) in [(1, 1, 2), (2, 2, 3)] {
        elements.insert(id.to_string(), SolverElement3D {
            id, elem_type: "frame".to_string(), node_i: ni, node_j: nj, material_id: 1, section_id: 1,
            release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
            release_t_start: false, release_t_end: false,
            local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
        });
    }
    let sup = |node_id: usize, fixed: bool, ry: bool, normal: Option<f64>| SolverSupport3D {
        node_id, rx: fixed, ry: fixed || ry, rz: fixed, rrx: fixed, rry: fixed, rrz: fixed,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: normal.map(|_| 0.0), normal_y: normal, normal_z: normal.map(|_| 0.0),
        is_inclined: normal.map(|_| true), rw: None, kw: None,
    };
    let mut supports = HashMap::new();
    supports.insert("1".to_string(), sup(1, true, false, None));
    supports.insert("2".to_string(), if inclined { sup(3, false, false, Some(1.0)) } else { sup(3, false, true, None) });
    SolverInput3D {
        nodes, materials, sections, elements, supports,
        loads: vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 3, fx: 1.0, fy: 0.0, fz: -100.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
        constraints: vec![], left_hand: None,
        plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(), curved_beams: vec![],
        connectors: HashMap::new(), solver_options: None, masses: Default::default(),
    }
}

/// 3D buckling used `assemble_sparse_3d`'s K, rotated into the
/// inclined-support frame, with an unrotated Kg (and unrotated mode shapes).
/// `assemble_sparse_3d` itself shares the linear path's stiffness, so the 3D
/// assembler has none of the 2D `_ex` differences; the gap was in the caller.
#[test]
fn buckling_3d_inclined_support_matches_plain_restraint() {
    let a = buckling::solve_buckling_3d(&column_3d(true), 2).expect("inclined");
    let b = buckling::solve_buckling_3d(&column_3d(false), 2).expect("plain");
    for (k, (ma, mb)) in a.modes.iter().zip(&b.modes).enumerate() {
        assert_close(&format!("load factor {k}"), ma.load_factor, mb.load_factor, mb.load_factor, 1e-8);
    }
}

/// 3D time integration paired the rotated K with an unrotated mass and force
/// history, and recorded states in the inclined-support frame.
#[test]
fn time_history_3d_inclined_support_matches_plain_restraint() {
    let run = |inclined: bool| {
        let mut densities = HashMap::new();
        densities.insert("1".to_string(), 7850.0);
        let solver = column_3d(inclined);
        let loads = solver.loads.iter().map(|l| match l {
            SolverLoad3D::Nodal(nl) => SolverNodalLoad3D { fy: 1.0, ..nl.clone() },
            _ => unreachable!(),
        }).collect();
        time_integration::solve_time_history_3d(&TimeHistoryInput3D {
            solver, densities, time_step: 0.002, n_steps: 100,
            method: "newmark".to_string(), beta: 0.25, gamma: 0.5, alpha: None, damping_xi: Some(0.05),
            ground_accel_x: None, ground_accel_y: None, ground_accel_z: None,
            force_history: Some(vec![TimeForceRecord3D { time: 0.0, loads }]),
        }).expect("time history 3d")
    };
    let (a, b) = (run(true), run(false));
    let top = |r: &TimeHistoryResult3D| r.node_histories.iter().find(|h| h.node_id == 3).unwrap().clone();
    let (ha, hb) = (top(&a), top(&b));
    let scale = hb.ux.iter().fold(0.0f64, |m, v| m.max(v.abs()));
    for t in 0..ha.ux.len() {
        assert_close(&format!("step {t} ux"), ha.ux[t], hb.ux[t], scale, 1e-8);
        assert_close(&format!("step {t} uz"), ha.uz[t], hb.uz[t], scale, 1e-8);
    }
}
