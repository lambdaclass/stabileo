//! Planted assembly bugs (docs/verification/CERTIFY.md, "End-to-end
//! certificates"): an engine whose assembly has a wrong sign in a transform,
//! a missing Timoshenko term or a wrong fixed-end force solves its own K and f
//! correctly, so the assembled-level certificate certifies the wrong answer.
//! The end-to-end certificate must fail on it, and its bound against the
//! model must still cover the real error.
//!
//! Each bug is planted by recomputing one element's contribution the buggy
//! way (with the engine's own element routines) and swapping it into the
//! engine's assembled K or f; the buggy system is then solved in f64 as the
//! engine would. `scripts/e2e-planted-bugs.sh` plants the same bugs in the
//! engine's source instead and runs the end-to-end tests.

use dedaliano_engine::certify::linear::certify_linear_system_auto;
use dedaliano_engine::certify::reassembly::{
    end_to_end_2d, end_to_end_2d_with, end_to_end_3d, end_to_end_3d_with, engine_assemblies_2d, engine_assemblies_3d,
    EndToEnd, EngineAssembly,
};
use dedaliano_engine::element::*;
use dedaliano_engine::linalg::{transform_force, transform_stiffness};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ---------------- models ----------------

fn portal_2d() -> SolverInput {
    let json = r#"{
      "nodes": {"1": {"id":1,"x":0,"z":0}, "2": {"id":2,"x":0.3,"z":4}, "3": {"id":3,"x":6,"z":4.5}, "4": {"id":4,"x":6.2,"z":0}},
      "materials": {"1": {"id":1,"e":200000,"nu":0.3}},
      "sections": {"1": {"id":1,"a":0.012,"iz":0.00021,"asY":0.0009}, "2": {"id":2,"a":0.01,"iz":0.00012}},
      "elements": {
        "1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":2},
        "2": {"id":2,"type":"frame","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":1},
        "3": {"id":3,"type":"frame","nodeI":3,"nodeJ":4,"materialId":1,"sectionId":2,"hingeEnd":true}
      },
      "supports": {"1": {"id":1,"nodeId":1,"type":"fixed"}, "2": {"id":2,"nodeId":4,"type":"pinned"}},
      "loads": [
        {"type":"distributed","data":{"elementId":2,"qI":-12,"qJ":-12}},
        {"type":"pointOnElement","data":{"elementId":1,"a":1.5,"p":8,"px":2}},
        {"type":"nodal","data":{"nodeId":2,"fx":15,"fz":0,"my":3}}
      ]
    }"#;
    serde_json::from_str(json).unwrap()
}

fn frame_3d() -> SolverInput3D {
    let json = r#"{
      "nodes": {"1": {"id":1,"x":0,"y":0,"z":0}, "2": {"id":2,"x":0.2,"y":0.1,"z":3.5}, "3": {"id":3,"x":5,"y":1,"z":3.8}, "4": {"id":4,"x":5.1,"y":1.2,"z":0}},
      "materials": {"1": {"id":1,"e":210000,"nu":0.3}},
      "sections": {"1": {"id":1,"a":0.01,"iy":0.00025,"iz":0.00008,"j":0.00002,"asY":0.004,"asZ":0.0012}},
      "elements": {
        "1": {"id":1,"type":"frame","nodeI":1,"nodeJ":2,"materialId":1,"sectionId":1},
        "2": {"id":2,"type":"frame","nodeI":2,"nodeJ":3,"materialId":1,"sectionId":1,"rollAngle":30},
        "3": {"id":3,"type":"frame","nodeI":3,"nodeJ":4,"materialId":1,"sectionId":1}
      },
      "supports": {
        "1": {"nodeId":1,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true},
        "2": {"nodeId":4,"rx":true,"ry":true,"rz":true,"rrx":true,"rry":true,"rrz":true}
      },
      "loads": [
        {"type":"distributed","data":{"elementId":2,"qYI":-3,"qYJ":-3,"qZI":-10,"qZJ":-10}},
        {"type":"nodal","data":{"nodeId":2,"fx":6,"fy":4,"fz":0,"mx":0,"my":0,"mz":0}}
      ]
    }"#;
    serde_json::from_str(json).unwrap()
}

// ---------------- the buggy engine ----------------

fn gauss_solve(mut a: Vec<f64>, n: usize, mut b: Vec<f64>) -> Vec<f64> {
    for c in 0..n {
        let p = (c..n).max_by(|&i, &j| a[i * n + c].abs().total_cmp(&a[j * n + c].abs())).unwrap();
        for k in 0..n {
            a.swap(c * n + k, p * n + k);
        }
        b.swap(c, p);
        for r in c + 1..n {
            let m = a[r * n + c] / a[c * n + c];
            for k in c..n {
                a[r * n + k] -= m * a[c * n + k];
            }
            b[r] -= m * b[c];
        }
    }
    let mut x = vec![0.0; n];
    for r in (0..n).rev() {
        let s: f64 = (r + 1..n).map(|k| a[r * n + k] * x[k]).sum();
        x[r] = (b[r] - s) / a[r * n + r];
    }
    x
}

/// Add an element-level change (engine DOF numbering) to every engine
/// assembly; solve the dense buggy system; return the assembly, the buggy
/// free displacements by engine DOF, and the buggy reduced system.
fn plant(
    mut engines: Vec<EngineAssembly>,
    dofs: &[usize],
    dk: &[f64],
    df: &[f64],
    nf: usize,
) -> (Vec<EngineAssembly>, Vec<f64>, Vec<f64>, Vec<f64>) {
    let m = dofs.len();
    for e in engines.iter_mut() {
        for a in 0..m {
            for b in 0..m {
                if dk[a * m + b] != 0.0 {
                    *e.k.entry((dofs[a], dofs[b])).or_insert(0.0) += dk[a * m + b];
                }
            }
            e.f[dofs[a]] += df[a];
        }
    }
    let e = &engines[0];
    let mut kff = vec![0.0; nf * nf];
    for (&(i, j), &v) in &e.k {
        if i < nf && j < nf {
            kff[i * nf + j] = v;
        }
    }
    let ff = e.f[..nf].to_vec();
    let u = gauss_solve(kff.clone(), nf, ff.clone());
    (engines, u, kff, ff)
}

struct Outcome {
    assembled_certifies_bug: bool,
    e2e_with_buggy_assembly: EndToEnd,
    e2e_bound_covers_error: bool,
    error: f64,
}

fn check_2d(input: &SolverInput, elem: usize, dk: Vec<f64>, df: Vec<f64>) -> Outcome {
    let dof_num = DofNumbering::build_2d(input);
    let el = input.elements.values().find(|e| e.id == elem).unwrap();
    let dofs = dof_num.element_dofs(el.node_i, el.node_j);
    let nf = dof_num.n_free;
    let truth = solve_2d(input).unwrap();
    let (engines, u, kff, ff) = plant(engine_assemblies_2d(input, &input.loads, &truth).unwrap(), &dofs, &dk, &df, nf);
    let assembled = certify_linear_system_auto(&kff, nf, &ff, &u);
    let mut buggy = truth.clone();
    let mut err2 = 0.0;
    for d in buggy.displacements.iter_mut() {
        for (local, slot) in [(0, &mut d.ux), (1, &mut d.uz), (2, &mut d.ry)] {
            if let Some(&g) = dof_num.map.get(&(d.node_id, local)) {
                if g < nf {
                    err2 += (u[g] - *slot).powi(2);
                    *slot = u[g];
                }
            }
        }
    }
    let with_bug = end_to_end_2d_with(input, &input.loads, &buggy, || Ok(engines));
    let against_model = end_to_end_2d(input, &input.loads, &buggy);
    Outcome {
        assembled_certifies_bug: assembled.is_certified(),
        e2e_with_buggy_assembly: with_bug,
        e2e_bound_covers_error: covers(&against_model, err2.sqrt()),
        error: err2.sqrt(),
    }
}

fn check_3d(input: &SolverInput3D, elem: usize, dk: Vec<f64>, df: Vec<f64>) -> Outcome {
    let dof_num = DofNumbering::build_3d(input);
    let el = input.elements.values().find(|e| e.id == elem).unwrap();
    let dofs = dof_num.element_dofs(el.node_i, el.node_j);
    let nf = dof_num.n_free;
    let (engines, u, kff, ff) = plant(engine_assemblies_3d(input, &input.loads).unwrap(), &dofs, &dk, &df, nf);
    let assembled = certify_linear_system_auto(&kff, nf, &ff, &u);
    let truth = solve_3d(input).unwrap();
    let mut buggy = truth.clone();
    let mut err2 = 0.0;
    for d in buggy.displacements.iter_mut() {
        for (local, slot) in [(0, &mut d.ux), (1, &mut d.uy), (2, &mut d.uz), (3, &mut d.rx), (4, &mut d.ry), (5, &mut d.rz)] {
            if let Some(&g) = dof_num.map.get(&(d.node_id, local)) {
                if g < nf {
                    err2 += (u[g] - *slot).powi(2);
                    *slot = u[g];
                }
            }
        }
    }
    let with_bug = end_to_end_3d_with(input, &input.loads, &buggy, || Ok(engines));
    let against_model = end_to_end_3d(input, &input.loads, &buggy);
    Outcome {
        assembled_certifies_bug: assembled.is_certified(),
        e2e_with_buggy_assembly: with_bug,
        e2e_bound_covers_error: covers(&against_model, err2.sqrt()),
        error: err2.sqrt(),
    }
}

/// The bound against the model holds for the buggy answer (it is a valid
/// statement about any ũ), so it must exceed the real error.
fn covers(e2e: &EndToEnd, err: f64) -> bool {
    match e2e {
        EndToEnd::Certified { abs_bound, .. } => *abs_bound >= err,
        // A failure to bound is also honest.
        EndToEnd::Failed { .. } => true,
        _ => false,
    }
}

fn assert_caught(name: &str, o: Outcome) {
    eprintln!("{name}: error {:.3e}, e2e {:?}", o.error, o.e2e_with_buggy_assembly);
    assert!(o.error > 1e-9, "{name}: the planted bug does not change the answer");
    assert!(o.assembled_certifies_bug, "{name}: the assembled-level certificate should certify the buggy solve");
    match &o.e2e_with_buggy_assembly {
        EndToEnd::Failed { reason } => assert!(reason.contains("disagrees"), "{name}: {reason}"),
        other => panic!("{name}: end-to-end certificate did not fail: {other:?}"),
    }
    assert!(o.e2e_bound_covers_error, "{name}: e2e bound below the real error");
}

fn geom_2d(input: &SolverInput, id: usize) -> (f64, f64, f64, f64, f64, f64, f64, f64) {
    let el = input.elements.values().find(|e| e.id == id).unwrap();
    let n = |i: usize| input.nodes.values().find(|n| n.id == i).unwrap();
    let (a, b) = (n(el.node_i), n(el.node_j));
    let (dx, dz) = (b.x - a.x, b.z - a.z);
    let l = (dx * dx + dz * dz).sqrt();
    let sec = input.sections.values().find(|s| s.id == el.section_id).unwrap();
    let mat = input.materials.values().find(|m| m.id == el.material_id).unwrap();
    let e = mat.e * 1000.0;
    let g = e / (2.0 * (1.0 + mat.nu));
    let phi = sec.as_y.map(|asy| 12.0 * e * sec.iz / (g * asy * l * l)).unwrap_or(0.0);
    (dx / l, dz / l, l, e, sec.a, sec.iz, phi, g)
}

fn sub(a: &[f64], b: &[f64]) -> Vec<f64> {
    a.iter().zip(b).map(|(x, y)| x - y).collect()
}

#[test]
fn correct_engine_is_certified_end_to_end() {
    let input = portal_2d();
    let r = solve_2d(&input).unwrap();
    let e = end_to_end_2d(&input, &input.loads, &r);
    assert!(e.is_certified(), "{e:?}");
    let input = frame_3d();
    let r = solve_3d(&input).unwrap();
    let e = end_to_end_3d(&input, &input.loads, &r);
    assert!(e.is_certified(), "{e:?}");
}

#[test]
fn planted_wrong_sign_in_2d_transform_fails() {
    let input = portal_2d();
    let (c, s, l, e, a, iz, phi, _) = geom_2d(&input, 2);
    let kl = frame_local_stiffness_2d(e, a, iz, l, false, false, phi);
    let good = transform_stiffness(&kl, &frame_transform_2d(c, s), 6);
    let bad = transform_stiffness(&kl, &frame_transform_2d(c, -s), 6);
    assert_caught("2D transform sign", check_2d(&input, 2, sub(&bad, &good), vec![0.0; 6]));
}

#[test]
fn planted_missing_timoshenko_term_fails() {
    let input = portal_2d();
    let (_, _, l, e, _, iz, phi, _) = geom_2d(&input, 2);
    // (2 − φ)·EI/(L(1+φ)) written as 2·EI/(L(1+φ)): a φ term dropped from the
    // rotation coupling (θ blocks are not rotated in 2D).
    let mut dk = vec![0.0; 36];
    let d = phi * e * iz / (l * (1.0 + phi));
    dk[2 * 6 + 5] = d;
    dk[5 * 6 + 2] = d;
    assert_caught("Timoshenko term", check_2d(&input, 2, dk, vec![0.0; 6]));
}

#[test]
fn planted_wrong_fixed_end_force_fails() {
    let input = portal_2d();
    let (c, s, l, _, _, _, phi, _) = geom_2d(&input, 2);
    let good = fef_distributed_2d(-12.0, -12.0, l, phi);
    let mut bad = good;
    bad[2] = -12.0 * l * l / 8.0; // qL²/8 instead of qL²/12
    let t = frame_transform_2d(c, s);
    let df = sub(&transform_force(&bad, &t, 6), &transform_force(&good, &t, 6));
    assert_caught("FEF qL²/8", check_2d(&input, 2, vec![0.0; 36], df));
}

fn geom_3d(input: &SolverInput3D, id: usize, roll: Option<f64>) -> (Vec<f64>, Vec<f64>) {
    let el = input.elements.values().find(|e| e.id == id).unwrap();
    let n = |i: usize| input.nodes.values().find(|n| n.id == i).unwrap();
    let (a, b) = (n(el.node_i), n(el.node_j));
    let (ex, ey, ez) = compute_local_axes_3d(a.x, a.y, a.z, b.x, b.y, b.z, el.local_yx, el.local_yy, el.local_yz, roll, false);
    let l = ((b.x - a.x).powi(2) + (b.y - a.y).powi(2) + (b.z - a.z).powi(2)).sqrt();
    let sec = input.sections.values().find(|s| s.id == el.section_id).unwrap();
    let mat = input.materials.values().find(|m| m.id == el.material_id).unwrap();
    let e = mat.e * 1000.0;
    let g = e / (2.0 * (1.0 + mat.nu));
    let py = 12.0 * e * sec.iy / (g * sec.as_y.unwrap() * l * l);
    let pz = 12.0 * e * sec.iz / (g * sec.as_z.unwrap() * l * l);
    let kl = frame_local_stiffness_3d(e, sec.a, sec.iy, sec.iz, sec.j, l, g, Hinge3D::from_elem(el), py, pz);
    let t = frame_transform_3d(&ex, &ey, &ez);
    (transform_stiffness(&kl, &t, 12), t)
}

#[test]
fn planted_wrong_roll_sign_in_3d_transform_fails() {
    let input = frame_3d();
    let (good, _) = geom_3d(&input, 2, Some(30.0));
    let (bad, _) = geom_3d(&input, 2, Some(-30.0));
    assert_caught("3D roll sign", check_3d(&input, 2, sub(&bad, &good), vec![0.0; 12]));
}

#[test]
fn planted_swapped_shear_areas_in_3d_fails() {
    let input = frame_3d();
    let mut swapped = input.clone();
    for s in swapped.sections.values_mut() {
        std::mem::swap(&mut s.as_y, &mut s.as_z);
    }
    let (good, _) = geom_3d(&input, 2, Some(30.0));
    let (bad, _) = geom_3d(&swapped, 2, Some(30.0));
    assert_caught("3D φ pairing", check_3d(&input, 2, sub(&bad, &good), vec![0.0; 12]));
}

#[test]
fn planted_unflipped_my_in_3d_fef_fails() {
    let input = frame_3d();
    let (_, t) = geom_3d(&input, 2, Some(30.0));
    let el = input.elements.values().find(|e| e.id == 2).unwrap();
    let n = |i: usize| input.nodes.values().find(|n| n.id == i).unwrap();
    let (a, b) = (n(el.node_i), n(el.node_j));
    let l = ((b.x - a.x).powi(2) + (b.y - a.y).powi(2) + (b.z - a.z).powi(2)).sqrt();
    // θy = −dw/dx: the q_z moments must be negated; the bug forgets it.
    let fz = fef_distributed_2d(-10.0, -10.0, l, 0.0);
    let mut dl = vec![0.0; 12];
    dl[4] = 2.0 * fz[2]; // bad − good = fz[2] − (−fz[2])
    dl[10] = 2.0 * fz[5];
    let df = transform_force(&dl, &t, 12);
    assert_caught("3D q_z moment sign", check_3d(&input, 2, vec![0.0; 144], df));
}


// ---------------- non-finite engine assemblies ----------------

/// A NaN or ±∞ in the engine's K or f must never read as agreement (a NaN
/// compares false both ways).
#[test]
fn non_finite_engine_assembly_is_not_certified() {
    let input = portal_2d();
    let r = solve_2d(&input).unwrap();
    let base = engine_assemblies_2d(&input, &input.loads, &r).unwrap();
    let key = *base[0].k.keys().find(|&&(i, j)| i == j && i < 3).unwrap();
    for bad in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        let mut k_bad = engine_assemblies_2d(&input, &input.loads, &r).unwrap();
        k_bad[0].k.insert(key, bad);
        let e = end_to_end_2d_with(&input, &input.loads, &r, || Ok(k_bad));
        assert!(matches!(e, EndToEnd::Failed { .. }), "K {bad}: {e:?}");
        let mut f_bad = engine_assemblies_2d(&input, &input.loads, &r).unwrap();
        f_bad[0].f[0] = bad;
        let e = end_to_end_2d_with(&input, &input.loads, &r, || Ok(f_bad));
        assert!(matches!(e, EndToEnd::Failed { .. }), "f {bad}: {e:?}");
    }
    let input = frame_3d();
    let r = solve_3d(&input).unwrap();
    let mut k_bad = engine_assemblies_3d(&input, &input.loads).unwrap();
    let key = *k_bad[0].k.keys().next().unwrap();
    k_bad[0].k.insert(key, f64::NAN);
    let e = end_to_end_3d_with(&input, &input.loads, &r, || Ok(k_bad));
    assert!(matches!(e, EndToEnd::Failed { .. }), "3D K NaN: {e:?}");
    let mut f_bad = engine_assemblies_3d(&input, &input.loads).unwrap();
    f_bad[0].f[0] = f64::INFINITY;
    let e = end_to_end_3d_with(&input, &input.loads, &r, || Ok(f_bad));
    assert!(matches!(e, EndToEnd::Failed { .. }), "3D f inf: {e:?}");
}

// ---------------- the assembly the solver used ----------------

/// A cantilever of `n_free_nodes` free frame nodes (3 DOFs each), an end node
/// guided in x (1 free DOF) when `extra`, and `fixed_nodes` unconnected fixed
/// nodes (restrained DOFs only, so many DOFs but few free ones).
fn chain_2d(n_free_nodes: usize, extra: bool, fixed_nodes: usize) -> SolverInput {
    let mut nodes = HashMap::new();
    let mut elements = HashMap::new();
    let mut supports = HashMap::new();
    let node = |id: usize, x: f64, z: f64| SolverNode { id, x, z };
    let el = |id: usize, i: usize, j: usize| SolverElement {
        id, elem_type: "frame".into(), node_i: i, node_j: j, material_id: 1, section_id: 1, hinge_start: false, hinge_end: false,
    };
    let sup = |id: usize, node_id: usize, t: &str| SolverSupport {
        id, node_id, support_type: t.into(), kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    };
    nodes.insert("1".into(), node(1, 0.0, 0.0));
    supports.insert("1".into(), sup(1, 1, "fixed"));
    let last = n_free_nodes + 1 + extra as usize;
    for id in 2..=last {
        nodes.insert(id.to_string(), node(id, (id - 1) as f64, 0.1 * (id as f64).sin()));
        elements.insert((id - 1).to_string(), el(id - 1, id - 1, id));
    }
    if extra {
        supports.insert("2".into(), sup(2, last, "guidedX"));
    }
    for k in 0..fixed_nodes {
        let id = last + 1 + k;
        nodes.insert(id.to_string(), node(id, k as f64, -5.0));
        supports.insert((10 + k).to_string(), sup(10 + k, id, "fixed"));
    }
    let loads = vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 3.0, fz: -10.0, my: 1.0 })];
    SolverInput {
        nodes,
        masses: Default::default(),
        materials: HashMap::from([("1".into(), SolverMaterial { id: 1, e: 200000.0, nu: 0.3 })]),
        sections: HashMap::from([("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None })]),
        elements, supports, loads, constraints: vec![], connectors: HashMap::new(), solver_options: None,
    }
}

/// The agreement check reads exactly the assembly the solver factored, on
/// both sides of the dense/sparse threshold (64 free DOFs), including a model
/// with more than 600 DOFs in all but fewer than 64 free ones (dense).
#[test]
fn agreement_reads_the_assembly_the_solver_used() {
    use dedaliano_engine::certify::{solver_assembly_2d, SolverAssembly};
    for (free_nodes, extra, fixed, want, nf) in [
        (21, false, 0, SolverAssembly::Dense, 63),
        (21, true, 0, SolverAssembly::Sparse, 64),
        (10, false, 220, SolverAssembly::Dense, 30),
    ] {
        let input = chain_2d(free_nodes, extra, fixed);
        assert_eq!(DofNumbering::build_2d(&input).n_free, nf);
        let r = solve_2d(&input).unwrap();
        assert_eq!(solver_assembly_2d(&input, &r), want, "nf {nf}");
        let e = end_to_end_2d(&input, &input.loads, &r);
        assert!(e.is_certified(), "nf {nf}: {e:?}");
        // A 1% change in the assembly the solver used is caught.
        let mut eng = engine_assemblies_2d(&input, &input.loads, &r).unwrap();
        let key = *eng[0].k.keys().find(|&&(i, j)| i == j && i < nf).unwrap();
        *eng[0].k.get_mut(&key).unwrap() *= 1.01;
        let e = end_to_end_2d_with(&input, &input.loads, &r, || Ok(eng));
        assert!(matches!(e, EndToEnd::Failed { .. }), "nf {nf}: {e:?}");
    }
}
