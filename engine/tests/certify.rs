//! Certified linear static results (docs/verification/CERTIFY.md).
//!
//! Honesty is checked against a reference solution of the same reduced f64
//! system computed by iterative refinement with double-double residuals and a
//! double-double solution vector (accurate to ~κ·ε², far below any bound).

use crate::common;
use crate::fuzz_models;

use common::*;
use dedaliano_engine::certify::buckling::{certify_buckling_2d, certify_buckling_3d, BucklingCertificate};
use dedaliano_engine::certify::{
    certify_linear_2d, certify_linear_3d, certify_linear_system, Certificate,
};
use dedaliano_engine::linalg::{lu_apply, lu_factor};
use dedaliano_engine::solver::assembly::{
    assemble_load_vector_2d, assemble_load_vector_3d_dense, assemble_stiffness_2d, assemble_stiffness_3d,
};
use dedaliano_engine::linalg::CscMatrix;
use dedaliano_engine::solver::assembly::assemble_stiffness_sparse_3d;
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::linear::{expand_curved_beams_3d, solve_2d, solve_3d, SPARSE_THRESHOLD};
use dedaliano_engine::solver::sparse_assembly::{assemble_load_vector_sparse_3d, assemble_stiffness_sparse_2d};
use dedaliano_engine::types::*;
use std::collections::HashMap;
use std::time::Instant;

// ───────────────────────── double-double reference ─────────────────────────

fn two_sum(a: f64, b: f64) -> (f64, f64) {
    let s = a + b;
    let bb = s - a;
    (s, (a - (s - bb)) + (b - bb))
}

fn two_prod(a: f64, b: f64) -> (f64, f64) {
    let p = a * b;
    (p, a.mul_add(b, -p))
}

/// Compensated accumulator (Ogita–Rump–Oishi Sum2/Dot2).
#[derive(Default, Clone, Copy)]
struct Acc {
    s: f64,
    c: f64,
}

impl Acc {
    fn add(&mut self, x: f64) {
        let (s, e) = two_sum(self.s, x);
        self.s = s;
        self.c += e;
    }
    fn add_prod(&mut self, a: f64, b: f64) {
        let (p, e) = two_prod(a, b);
        self.add(p);
        self.c += e;
    }
    fn hi_lo(self) -> (f64, f64) {
        two_sum(self.s, self.c)
    }
}

/// Reduced system K_FF u = f_F − K_FR u_R (f as hi+lo), plus the solver's ũ_F.
struct Reduced {
    k: Vec<f64>,
    n: usize,
    f_hi: Vec<f64>,
    f_lo: Vec<f64>,
    u: Vec<f64>,
}

fn reduce(k_full: &[f64], n: usize, nf: usize, f: &[f64], u_full: &[f64]) -> Reduced {
    let mut k = vec![0.0; nf * nf];
    let (mut f_hi, mut f_lo) = (vec![0.0; nf], vec![0.0; nf]);
    for i in 0..nf {
        k[i * nf..(i + 1) * nf].copy_from_slice(&k_full[i * n..i * n + nf]);
        let mut acc = Acc::default();
        acc.add(f[i]);
        for j in nf..n {
            acc.add_prod(-k_full[i * n + j], u_full[j]);
        }
        (f_hi[i], f_lo[i]) = acc.hi_lo();
    }
    Reduced { k, n: nf, f_hi, f_lo, u: u_full[..nf].to_vec() }
}

fn reduced_2d(input: &SolverInput, res: &AnalysisResults) -> Reduced {
    let dof = DofNumbering::build_2d(input);
    let (k, f) = if dof.n_free >= SPARSE_THRESHOLD {
        let st = assemble_stiffness_sparse_2d(input, &dof);
        let f = assemble_load_vector_2d(input, &input.loads, &dof, &st.inclined_transforms_2d);
        (dense_from_lower(&st.k_full), f)
    } else {
        let st = assemble_stiffness_2d(input, &dof);
        let f = assemble_load_vector_2d(input, &input.loads, &dof, &st.inclined_transforms_2d);
        (st.k, f)
    };
    let d: HashMap<usize, &Displacement> = res.displacements.iter().map(|d| (d.node_id, d)).collect();
    let mut u = vec![0.0; dof.n_total];
    for (&(node, l), &g) in &dof.map {
        let x = d[&node];
        u[g] = [x.ux, x.uz, x.ry][l];
    }
    reduce(&k, dof.n_total, dof.n_free, &f, &u)
}

/// Dense copy of a symmetric matrix stored as its lower triangle.
fn dense_from_lower(a: &CscMatrix) -> Vec<f64> {
    let n = a.n;
    let mut d = vec![0.0; n * n];
    for j in 0..n {
        for p in a.col_ptr[j]..a.col_ptr[j + 1] {
            let i = a.row_idx[p];
            d[i * n + j] = a.values[p];
            d[j * n + i] = a.values[p];
        }
    }
    d
}

fn reduced_3d(input: &SolverInput3D, res: &AnalysisResults3D) -> Reduced {
    let input = &expand_curved_beams_3d(input);
    let dof = DofNumbering::build_3d(input);
    // Same assembly as the certificate: the solver's sparse path above the threshold.
    let (k, f) = if dof.n_free >= SPARSE_THRESHOLD {
        let st = assemble_stiffness_sparse_3d(input, &dof, true);
        let f = assemble_load_vector_sparse_3d(input, &input.loads, &dof, &st.inclined_transforms);
        (dense_from_lower(st.k_full.as_ref().unwrap()), f)
    } else {
        let st = assemble_stiffness_3d(input, &dof);
        let f = assemble_load_vector_3d_dense(input, &input.loads, &dof, &st.inclined_transforms);
        (st.k, f)
    };
    let d: HashMap<usize, &Displacement3D> = res.displacements.iter().map(|d| (d.node_id, d)).collect();
    let mut u = vec![0.0; dof.n_total];
    for (&(node, l), &g) in &dof.map {
        let x = d[&node];
        u[g] = [x.ux, x.uy, x.uz, x.rx, x.ry, x.rz, x.warping.unwrap_or(0.0)][l];
    }
    reduce(&k, dof.n_total, dof.n_free, &f, &u)
}

/// Reference solution (hi, lo) by double-double iterative refinement.
fn reference_solution(r: &Reduced) -> Option<(Vec<f64>, Vec<f64>)> {
    let n = r.n;
    let mut lu = r.k.clone();
    let piv = lu_factor(&mut lu, n)?;
    let mut xh = vec![0.0; n];
    let mut xl = vec![0.0; n];
    for _ in 0..30 {
        let mut res = vec![0.0; n];
        for i in 0..n {
            let mut acc = Acc::default();
            acc.add(r.f_hi[i]);
            acc.add(r.f_lo[i]);
            for j in 0..n {
                let kij = r.k[i * n + j];
                acc.add_prod(-kij, xh[j]);
                acc.add_prod(-kij, xl[j]);
            }
            res[i] = acc.hi_lo().0;
        }
        let d = lu_apply(&lu, &piv, &res, n)?;
        for i in 0..n {
            let (s, e) = two_sum(xh[i], d[i]);
            (xh[i], xl[i]) = two_sum(s, xl[i] + e);
        }
    }
    Some((xh, xl))
}

/// ‖ũ − u_ref‖₂ computed accurately.
fn true_error(r: &Reduced) -> f64 {
    let (xh, xl) = reference_solution(r).expect("reference solve");
    let mut acc = 0.0f64;
    for i in 0..r.n {
        let (d, e) = two_sum(r.u[i], -xh[i]);
        let di = d + (e - xl[i]);
        acc += di * di;
    }
    acc.sqrt()
}

fn norm(v: &[f64]) -> f64 {
    v.iter().map(|x| x * x).sum::<f64>().sqrt()
}

/// Assert the certificate's bound dominates the true error. Returns (abs, rel, err).
fn assert_honest(label: &str, cert: &Certificate, r: &Reduced) -> (f64, f64, f64) {
    let Certificate::Certified { abs_bound, rel_bound, .. } = cert else {
        panic!("{label}: expected certified, got {cert:?}");
    };
    let err = true_error(r);
    assert!(err <= *abs_bound, "{label}: true error {err:e} exceeds bound {abs_bound:e}");
    let un = norm(&r.u);
    if un > 0.0 {
        assert!(err / un <= *rel_bound * (1.0 + 1e-12), "{label}: relative bound violated");
    }
    (*abs_bound, *rel_bound, err)
}

// ───────────────────────── fixtures ─────────────────────────

fn fixture_paths(prefix: &str, filter: impl Fn(&str) -> bool) -> Vec<std::path::PathBuf> {
    let mut v: Vec<_> = std::fs::read_dir(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures"))
        .unwrap()
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            let n = p.file_name().unwrap().to_str().unwrap();
            n.starts_with(prefix) && n.ends_with("-input.json") && filter(n)
        })
        .collect();
    v.sort();
    v
}

#[test]
fn certify_2d_fixtures() {
    let mut paths = fixture_paths("ex-", |n| !n.starts_with("ex-3d-"));
    paths.extend(fixture_paths("random-", |_| true));
    let (mut certified, mut unsupported) = (0, 0);
    for p in &paths {
        let name = p.file_name().unwrap().to_str().unwrap();
        let json = std::fs::read_to_string(p).unwrap();
        let Ok(input) = serde_json::from_str::<SolverInput>(&json) else {
            eprintln!("{name}: not a 2D SolverInput, skipped");
            continue;
        };
        let (res, cert) = match certify_linear_2d(&input) {
            Ok(x) => x,
            Err(e) => {
                eprintln!("{name}: solver error {e}");
                continue;
            }
        };
        // same displacements as plain solve_2d
        let plain = solve_2d(&input).unwrap();
        for (a, b) in res.displacements.iter().zip(&plain.displacements) {
            assert_eq!((a.ux, a.uz, a.ry), (b.ux, b.uz, b.ry));
        }
        match &cert {
            Certificate::Uncertified { reason } => {
                assert!(reason.starts_with("unsupported"), "{name}: uncertified: {reason}");
                eprintln!("{name}: {reason}");
                unsupported += 1;
            }
            Certificate::Certified { .. } => {
                let r = reduced_2d(&input, &res);
                let (abs, rel, err) = assert_honest(name, &cert, &r);
                eprintln!("{name}: nf={} abs={abs:.2e} rel={rel:.2e} true_err={err:.2e}", r.n);
                certified += 1;
            }
        }
    }
    eprintln!("2D fixtures: {certified} certified, {unsupported} unsupported");
    assert!(certified >= 20, "only {certified} 2D fixtures certified");
}

fn certify_3d_fixture_set(max_nf: usize, min_nf: usize, strict: bool) -> usize {
    let mut certified = 0;
    for p in fixture_paths("ex-3d-", |_| true) {
        let name = p.file_name().unwrap().to_str().unwrap().to_string();
        let input: SolverInput3D = serde_json::from_str(&std::fs::read_to_string(&p).unwrap()).unwrap();
        let nf = DofNumbering::build_3d(&expand_curved_beams_3d(&input)).n_free;
        if nf > max_nf || nf < min_nf {
            continue;
        }
        let (res, cert) = certify_linear_3d(&input).unwrap();
        match &cert {
            Certificate::Uncertified { reason } => {
                assert!(!strict || reason.starts_with("unsupported"), "{name}: uncertified: {reason}");
                eprintln!("{name}: nf={nf} {reason}");
            }
            Certificate::Certified { .. } => {
                let r = reduced_3d(&input, &res);
                let (abs, rel, err) = assert_honest(&name, &cert, &r);
                eprintln!("{name}: nf={nf} abs={abs:.2e} rel={rel:.2e} true_err={err:.2e}");
                certified += 1;
            }
        }
    }
    certified
}

#[test]
fn certify_3d_fixtures_small() {
    let c = certify_3d_fixture_set(400, 0, true);
    assert!(c >= 4, "only {c} 3D fixtures certified");
}

/// Larger 3D fixtures (slow in debug): `cargo test --release --test certificates certify:: -- --ignored`.
/// Reports only: the naive interval Cholesky of CERTIFY.md may legitimately
/// fail (Uncertified) on larger models through interval overestimation.
#[test]
#[ignore]
fn certify_3d_fixtures_large() {
    let t = Instant::now();
    certify_3d_fixture_set(usize::MAX, 401, false);
    eprintln!("large 3D fixtures: {:.1} s", t.elapsed().as_secs_f64());
}

// ───────────────────────── synthetic models ─────────────────────────

fn portal() -> SolverInput {
    make_portal_frame(4.0, 6.0, 200_000.0, 0.01, 1e-4, 10.0, -20.0)
}

#[test]
fn certify_basic_models_2d() {
    let models = vec![
        ("portal", portal()),
        (
            "continuous",
            make_continuous_beam(
                &[5.0, 7.0, 5.0],
                8,
                30_000.0,
                0.12,
                1.6e-3,
                (1..=24)
                    .map(|i| SolverLoad::Distributed(SolverDistributedLoad {
                        element_id: i, q_i: -10.0, q_j: -10.0, a: None, b: None,
                    }))
                    .collect(),
            ),
        ),
    ];
    for (name, input) in models {
        let (res, cert) = certify_linear_2d(&input).unwrap();
        let r = reduced_2d(&input, &res);
        let (abs, rel, err) = assert_honest(name, &cert, &r);
        eprintln!("{name}: abs={abs:.2e} rel={rel:.2e} err={err:.2e}");
        assert!(rel < 1e-8, "{name}: rel bound unexpectedly loose: {rel:e}");
    }
}

/// A deliberately perturbed ũ: the bound must cover the perturbation.
#[test]
fn bound_covers_deliberate_perturbation() {
    let input = portal();
    let res = solve_2d(&input).unwrap();
    let mut r = reduced_2d(&input, &res);
    let un = norm(&r.u);
    for (i, x) in r.u.iter_mut().enumerate() {
        *x += un * 1e-5 * if i % 2 == 0 { 1.0 } else { -0.7 };
    }
    let f: Vec<f64> = r.f_hi.iter().zip(&r.f_lo).map(|(h, l)| h + l).collect();
    // σ from the auto path on the unperturbed system
    let sigma = match certify_linear_2d(&input).unwrap().1 {
        Certificate::Certified { sigma, .. } => sigma,
        c => panic!("{c:?}"),
    };
    let cert = certify_linear_system(&r.k, r.n, &f, &r.u, sigma);
    let Certificate::Certified { abs_bound, .. } = cert else { panic!("{cert:?}") };
    let err = true_error(&r);
    assert!(err > 1e-6 * un, "perturbation should dominate");
    assert!(err <= abs_bound, "err {err:e} > bound {abs_bound:e}");
    // σ larger than λ_min must be refused
    let refused = certify_linear_system(&r.k, r.n, &f, &r.u, 1e30);
    assert!(!refused.is_certified());
}

/// Very stiff and very flexible members together: either an honest (larger)
/// bound or Uncertified — never a wrong bound.
#[test]
fn ill_conditioned_models() {
    for (stiff_e, flex_e) in [(2e8, 2e-2), (2e11, 2e-5), (2e14, 2e-8)] {
        let input = make_input(
            vec![(1, 0.0, 0.0), (2, 3.0, 0.0), (3, 6.0, 0.0), (4, 9.0, 0.0), (5, 9.0, 3.0)],
            vec![(1, stiff_e, 0.3), (2, flex_e, 0.3)],
            vec![(1, 0.05, 1e-3), (2, 1e-4, 1e-8)],
            vec![
                (1, "frame", 1, 2, 1, 1, false, false),
                (2, "frame", 2, 3, 2, 2, false, false),
                (3, "frame", 3, 4, 1, 1, false, false),
                (4, "frame", 4, 5, 2, 2, false, false),
            ],
            vec![(1, 1, "fixed"), (2, 5, "pinned")],
            vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 1.0, fz: -5.0, my: 0.3 })],
        );
        let label = format!("E ratio {:.0e}", stiff_e / flex_e);
        match certify_linear_2d(&input) {
            Err(e) => eprintln!("{label}: solver error {e}"),
            Ok((res, cert)) => match &cert {
                Certificate::Uncertified { reason } => eprintln!("{label}: uncertified ({reason})"),
                Certificate::Certified { .. } => {
                    let r = reduced_2d(&input, &res);
                    let (abs, rel, err) = assert_honest(&label, &cert, &r);
                    eprintln!("{label}: abs={abs:.2e} rel={rel:.2e} err={err:.2e}");
                }
            },
        }
    }
}

fn assert_never_certified(label: &str, out: Result<(AnalysisResults, Certificate), String>) {
    match out {
        Err(e) => eprintln!("{label}: solver refused ({e})"),
        Ok((_, Certificate::Uncertified { reason })) => eprintln!("{label}: uncertified ({reason})"),
        Ok((_, c)) => panic!("{label}: mechanism certified: {c:?}"),
    }
}

#[test]
fn mechanisms_never_certified() {
    // Square truss with no diagonal: sway mechanism.
    let square = make_input(
        vec![(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 4.0, 3.0), (4, 0.0, 3.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 0.0)],
        vec![
            (1, "truss", 1, 4, 1, 1, false, false),
            (2, "truss", 4, 3, 1, 1, false, false),
            (3, "truss", 3, 2, 1, 1, false, false),
        ],
        vec![(1, 1, "pinned"), (2, 2, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -10.0, my: 0.0 })],
    );
    assert_never_certified("truss sway", certify_linear_2d(&square));

    // Beam on two rollers: rigid horizontal translation unrestrained.
    let rollers = make_beam(4, 8.0, 200_000.0, 0.01, 1e-4, "rollerX", Some("rollerX"), vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: 3, fx: 0.0, fz: -10.0, my: 0.0 }),
    ]);
    assert_never_certified("rollers", certify_linear_2d(&rollers));

    // Three collinear hinges in a frame span: local mechanism.
    let hinged = make_input(
        vec![(1, 0.0, 0.0), (2, 3.0, 0.0), (3, 6.0, 0.0)],
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.01, 1e-4)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, true),
            (2, "frame", 2, 3, 1, 1, true, false),
        ],
        vec![(1, 1, "pinned"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -10.0, my: 0.0 })],
    );
    assert_never_certified("hinge chain", certify_linear_2d(&hinged));

    // Near-singular system directly: S ⪰ 0 with a zero eigenvalue.
    let k = vec![1.0, -1.0, 0.0, -1.0, 2.0, -1.0, 0.0, -1.0, 1.0];
    let c = dedaliano_engine::certify::certify_linear_system_auto(&k, 3, &[1.0, 0.0, -1.0], &[1.0, 0.0, -1.0]);
    assert!(!c.is_certified(), "{c:?}");
}

#[test]
fn certify_3d_beam() {
    let mut input = make_3d_beam(
        10, 6.0, 200_000.0, 0.3, 0.01, 1e-4, 2e-4, 1e-5,
        vec![true; 6], None,
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 11, fx: 1.0, fy: -3.0, fz: 2.0, mx: 0.1, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    pin_legacy_local_axes(&mut input);
    let (res, cert) = certify_linear_3d(&input).unwrap();
    let r = reduced_3d(&input, &res);
    let (abs, rel, err) = assert_honest("3d cantilever", &cert, &r);
    eprintln!("3d cantilever: abs={abs:.2e} rel={rel:.2e} err={err:.2e}");
    let plain = solve_3d(&input).unwrap();
    assert_eq!(plain.displacements[3].uy, res.displacements[3].uy);
}

// ───────────────────────── overhead ─────────────────────────

/// Grid frame with `bays × stories` bays, fixed bases, lateral + gravity loads.
fn grid_frame(bays: usize, stories: usize) -> SolverInput {
    let mut nodes = vec![];
    let id = |c: usize, s: usize| s * (bays + 1) + c + 1;
    for s in 0..=stories {
        for c in 0..=bays {
            nodes.push((id(c, s), c as f64 * 6.0, s as f64 * 3.5));
        }
    }
    let mut elems = vec![];
    let mut e = 1;
    for s in 0..stories {
        for c in 0..=bays {
            elems.push((e, "frame", id(c, s), id(c, s + 1), 1, 1, false, false));
            e += 1;
        }
    }
    for s in 1..=stories {
        for c in 0..bays {
            elems.push((e, "frame", id(c, s), id(c + 1, s), 1, 2, false, false));
            e += 1;
        }
    }
    let sups = (0..=bays).map(|c| (c + 1, id(c, 0), "fixed")).collect();
    let loads = (1..=stories)
        .flat_map(|s| (0..=bays).map(move |c| (c, s)))
        .map(|(c, s)| SolverLoad::Nodal(SolverNodalLoad { node_id: id(c, s), fx: 5.0, fz: -20.0, my: 0.0 }))
        .collect();
    make_input(nodes, vec![(1, 30_000.0, 0.2)], vec![(1, 0.16, 2.1e-3), (2, 0.12, 1.6e-3)], elems, sups, loads)
}

/// Overhead of certification vs plain solve. Run with
/// `cargo test --release --test certificates certify::overhead -- --ignored --nocapture`.
#[test]
#[ignore]
fn overhead() {
    for (bays, stories) in [(2, 3), (4, 8), (6, 15), (8, 15), (6, 30), (10, 20), (20, 40), (30, 80), (50, 100)] {
        let input = grid_frame(bays, stories);
        let nf = DofNumbering::build_2d(&input).n_free;
        let t = Instant::now();
        let res = solve_2d(&input).unwrap();
        let t_solve = t.elapsed();
        let t = Instant::now();
        let (_, cert) = certify_linear_2d(&input).unwrap();
        let t_cert = t.elapsed();
        let outcome = match &cert {
            Certificate::Certified { abs_bound, rel_bound, .. } => {
                assert_honest("grid", &cert, &reduced_2d(&input, &res));
                format!("abs={abs_bound:.2e} rel={rel_bound:.2e}")
            }
            Certificate::Uncertified { reason } => format!("UNCERTIFIED: {reason}"),
        };
        eprintln!(
            "nf={nf:5}: solve {:9.3} ms, solve+certify {:10.1} ms ({:.0}x), {outcome}",
            t_solve.as_secs_f64() * 1e3,
            t_cert.as_secs_f64() * 1e3,
            t_cert.as_secs_f64() / t_solve.as_secs_f64()
        );
    }
}

// ───────────────────────── buckling ─────────────────────────

fn assert_buckling_enclosure(name: &str, cert: &BucklingCertificate) -> (f64, Option<f64>) {
    let BucklingCertificate::Certified { lambda_lower, lambda_upper, lambda_computed } = cert else {
        panic!("{name}: {cert:?}");
    };
    assert!(*lambda_lower > 0.0 && lambda_lower <= lambda_computed, "{name}: {cert:?}");
    if let Some(ub) = lambda_upper {
        assert!(lambda_computed <= ub, "{name}: {cert:?}");
    }
    (*lambda_lower, *lambda_upper)
}

#[test]
fn certify_buckling_euler_column() {
    // Pinned–pinned column: FE λ_cr converges to π²EI/(PL²) from above.
    let (l, e, a, iz, p) = (5.0, 200_000.0, 0.01, 1e-4, 100.0);
    let euler = std::f64::consts::PI.powi(2) * e * 1000.0 * iz / (l * l) / p;
    for n_elem in [4, 16, 64] {
        let input = make_column(n_elem, l, e, a, iz, "pinned", "rollerX", -p);
        let out = certify_buckling_2d(&input, 1).unwrap();
        let (lo, hi) = assert_buckling_enclosure("column", &out.certificate);
        let hi = hi.expect("Rayleigh upper bound");
        eprintln!("column n={n_elem}: λ_cr ∈ [{lo:.9e}, {hi:.9e}], Euler {euler:.9e}");
        assert!((hi - lo) / lo < 1e-3, "enclosure too wide: [{lo}, {hi}]");
        assert!(lo > 0.99 * euler && lo < 1.05 * euler, "λ̲ {lo} vs Euler {euler}");
    }
}

/// Two identical pinned columns tied at mid-height: the in-phase mode loads
/// no tie, so the constrained λ_cr is the single column's. Both certified
/// enclosures contain that same exact value, so they must intersect.
#[test]
fn certify_buckling_constrained_columns() {
    let (l, e, a, iz, p, ne) = (5.0, 200_000.0, 0.01, 1e-4, 100.0, 16);
    let single = make_column(ne, l, e, a, iz, "pinned", "rollerX", -p);
    let one = certify_buckling_2d(&single, 1).unwrap();
    let (lo1, hi1) = assert_buckling_enclosure("single", &one.certificate);
    let mut nodes = vec![];
    let mut elems = vec![];
    for c in 0..2 {
        let base = c * (ne + 1);
        for i in 0..=ne {
            nodes.push((base + i + 1, i as f64 * l / ne as f64, 2.0 * c as f64));
        }
        for i in 0..ne {
            elems.push((c * ne + i + 1, "frame", base + i + 1, base + i + 2, 1, 1, false, false));
        }
    }
    let mut two = make_input(
        nodes,
        vec![(1, e, 0.3)],
        vec![(1, a, iz)],
        elems,
        vec![(1, 1, "pinned"), (2, ne + 1, "rollerX"), (3, ne + 2, "pinned"), (4, 2 * ne + 2, "rollerX")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: ne + 1, fx: -p, fz: 0.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2 * ne + 2, fx: -p, fz: 0.0, my: 0.0 }),
        ],
    );
    two.constraints = vec![Constraint::EqualDOF(EqualDOFConstraint {
        master_node: ne / 2 + 1, slave_node: ne + 1 + ne / 2 + 1, dofs: vec![1],
    })];
    let out = certify_buckling_2d(&two, 1).unwrap();
    let (lo2, hi2) = assert_buckling_enclosure("tied", &out.certificate);
    let hi2 = hi2.expect("Rayleigh upper bound");
    let hi1 = hi1.expect("Rayleigh upper bound");
    eprintln!("single [{lo1:.9e}, {hi1:.9e}], tied [{lo2:.9e}, {hi2:.9e}]");
    assert!(lo2 <= hi1 && lo1 <= hi2, "enclosures of the same λ_cr do not intersect");
    assert!((hi2 - lo2) / lo2 < 1e-3, "enclosure too wide");

    // A tie that is not a symmetry: column B twice as stiff and tied, so the
    // pair buckles together above the single column's λ_cr.
    let mut stiff = two.clone();
    stiff.sections.insert("2".into(), SolverSection { id: 2, a, iz: 2.0 * iz, as_y: None });
    for el in stiff.elements.values_mut() {
        if el.node_i > ne + 1 {
            el.section_id = 2;
        }
    }
    let out = certify_buckling_2d(&stiff, 1).unwrap();
    let (lo3, _) = assert_buckling_enclosure("tied stiff pair", &out.certificate);
    assert!(lo3 > hi1, "tying to a stiffer column must raise λ_cr: {lo3} vs {hi1}");
}

/// 3D: a building fixture with a diaphragm on every floor.
#[test]
fn certify_buckling_3d_diaphragms() {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ex-3d-building-case1-input.json");
    let mut input: SolverInput3D = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let supported: Vec<usize> = input.supports.values().map(|s| s.node_id).collect();
    let mut floors: HashMap<u64, Vec<usize>> = HashMap::new();
    for n in input.nodes.values().filter(|n| !supported.contains(&n.id)) {
        floors.entry(n.y.to_bits()).or_default().push(n.id);
    }
    for mut ids in floors.into_values() {
        ids.sort();
        input.constraints.push(Constraint::Diaphragm(DiaphragmConstraint {
            master_node: ids[0], slave_nodes: ids[1..].to_vec(), plane: "XZ".into(),
        }));
    }
    let out = certify_buckling_3d(&input, 1).unwrap();
    let (lo, hi) = assert_buckling_enclosure("building + diaphragms", &out.certificate);
    let hi = hi.expect("Rayleigh upper bound");
    eprintln!("building + diaphragms: λ_cr ∈ [{lo:.9e}, {hi:.9e}]");
    assert!((hi - lo) / lo < 1e-3, "enclosure too wide");
}

#[test]
fn certify_buckling_3d_fixtures() {
    let mut certified = 0;
    for p in fixture_paths("ex-3d-", |_| true) {
        let name = p.file_name().unwrap().to_str().unwrap().to_string();
        let input: SolverInput3D = serde_json::from_str(&std::fs::read_to_string(&p).unwrap()).unwrap();
        if DofNumbering::build_3d(&expand_curved_beams_3d(&input)).n_free > 600 {
            continue;
        }
        let Ok(out) = certify_buckling_3d(&input, 1) else { continue }; // no compression etc.
        match &out.certificate {
            BucklingCertificate::Uncertified { reason, .. } => eprintln!("{name}: {reason}"),
            c => {
                let (lo, hi) = assert_buckling_enclosure(&name, c);
                eprintln!("{name}: λ_cr ∈ [{lo:.6e}, {hi:?}]");
                certified += 1;
            }
        }
    }
    assert!(certified >= 1, "no 3D buckling fixture certified");
}

// ───────────────────────── modal ─────────────────────────

#[test]
fn certify_modal_3d_fixtures() {
    use dedaliano_engine::certify::modal::{certify_modal_3d, ModalCertificate};
    let mut complete = 0;
    for p in fixture_paths("ex-3d-", |_| true) {
        let name = p.file_name().unwrap().to_str().unwrap().to_string();
        let input: SolverInput3D = serde_json::from_str(&std::fs::read_to_string(&p).unwrap()).unwrap();
        if !input.constraints.is_empty() || DofNumbering::build_3d(&input).n_free > 600 {
            continue;
        }
        let densities: HashMap<String, f64> =
            input.materials.values().map(|m| (m.id.to_string(), 7.85)).collect();
        let Ok(out) = certify_modal_3d(&input, &densities, 6) else { continue };
        match &out.certificate {
            ModalCertificate::Uncertified { reason } => eprintln!("{name}: {reason}"),
            ModalCertificate::Certified { modes, complete_modes, cutoff_omega2, count_failure } => {
                for (e, m) in modes.iter().zip(&out.results.modes) {
                    let w2 = m.omega * m.omega;
                    assert!(e.omega2_lower <= w2 && w2 <= e.omega2_upper, "{name}: {e:?}");
                }
                let w = modes.iter().map(|e| (e.omega2_upper - e.omega2_lower) / e.omega2_computed).fold(0.0, f64::max);
                eprintln!(
                    "{name}: max rel width {w:.1e}, {complete_modes}/{} complete below ω² = {cutoff_omega2:.4e} {count_failure:?}",
                    modes.len()
                );
                if *complete_modes == modes.len() {
                    complete += 1;
                }
            }
        }
    }
    assert!(complete >= 3, "only {complete} fixtures certified complete");
}

/// Constrained modal: a diaphragm on every floor of a building fixture (3D)
/// and tied columns (2D). Every computed ω² lies in its certified enclosure.
#[test]
fn certify_modal_constrained() {
    use dedaliano_engine::certify::modal::{certify_modal_2d, certify_modal_3d, ModalCertificate};
    let check = |name: &str, c: &ModalCertificate, omegas: Vec<f64>| -> usize {
        let ModalCertificate::Certified { modes, complete_modes, .. } = c else { panic!("{name}: {c:?}") };
        for (e, w) in modes.iter().zip(omegas) {
            let w2 = w * w;
            assert!(e.omega2_lower <= w2 && w2 <= e.omega2_upper, "{name}: {e:?}");
            assert!((e.omega2_upper - e.omega2_lower) / w2 < 1e-6, "{name}: enclosure too wide {e:?}");
        }
        eprintln!("{name}: {complete_modes}/{} complete", modes.len());
        *complete_modes
    };
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ex-3d-building-case1-input.json");
    let mut input: SolverInput3D = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let supported: Vec<usize> = input.supports.values().map(|s| s.node_id).collect();
    let mut floors: HashMap<u64, Vec<usize>> = HashMap::new();
    for n in input.nodes.values().filter(|n| !supported.contains(&n.id)) {
        floors.entry(n.y.to_bits()).or_default().push(n.id);
    }
    for mut ids in floors.into_values() {
        ids.sort();
        input.constraints.push(Constraint::Diaphragm(DiaphragmConstraint {
            master_node: ids[0], slave_nodes: ids[1..].to_vec(), plane: "XZ".into(),
        }));
    }
    let densities: HashMap<String, f64> = input.materials.values().map(|m| (m.id.to_string(), 7.85)).collect();
    let out = certify_modal_3d(&input, &densities, 6).unwrap();
    let complete = check("building + diaphragms", &out.certificate, out.results.modes.iter().map(|m| m.omega).collect());
    assert!(complete >= 1);

    let input = tied_columns_2d();
    let densities: HashMap<String, f64> = input.materials.values().map(|m| (m.id.to_string(), 2.5)).collect();
    let out = certify_modal_2d(&input, &densities, 3).unwrap();
    check("tied columns 2d", &out.certificate, out.results.modes.iter().map(|m| m.omega).collect());
}

// ───────────────────────── fuzz with an oracle ─────────────────────────

/// When the certificate's own f64 Cholesky shows K is not positive definite,
/// the solver's results must carry the matching warning.
fn assert_not_pd_warned(reason: &str, diags: &[StructuredDiagnostic]) {
    if reason.contains("not positive definite (f64 Cholesky") || reason.contains("sparse Cholesky failed") {
        assert!(
            diags.iter().any(|d| d.code == DiagnosticCode::StiffnessNotPositiveDefinite),
            "non-positive-definite K returned without a warning ({reason})"
        );
    }
}

/// Random models (the crash-free fuzz generators): whenever the solver returns
/// results, the certificate is either honest (true error ≤ bound, checked
/// against a double-double reference) or Uncertified with a reason.
#[test]
fn certify_fuzz_oracle() {
    use dedaliano_engine::certify::{certify_results_2d, certify_results_3d};
    let (mut cert, mut unc, mut solved) = (0, 0, 0);
    let mut reasons: HashMap<String, usize> = HashMap::new();
    for seed in 0..400u64 {
        let input = fuzz_models::random_2d_model(seed);
        if let Ok(res) = solve_2d(&input) {
            solved += 1;
            match certify_results_2d(&input, &res) {
                c @ Certificate::Certified { .. } => {
                    assert_honest(&format!("2d seed {seed}"), &c, &reduced_2d(&input, &res));
                    cert += 1;
                }
                Certificate::Uncertified { reason } => {
                    assert!(!reason.is_empty());
                    assert_not_pd_warned(&reason, &res.structured_diagnostics);
                    *reasons.entry(reason.chars().take(40).collect()).or_default() += 1;
                    unc += 1;
                }
            }
        }
        let input = fuzz_models::random_3d_model(100_000 + seed);
        if let Ok(res) = solve_3d(&input) {
            solved += 1;
            match certify_results_3d(&input, &res) {
                c @ Certificate::Certified { .. } => {
                    assert_honest(&format!("3d seed {seed}"), &c, &reduced_3d(&input, &res));
                    cert += 1;
                }
                Certificate::Uncertified { reason } => {
                    assert!(!reason.is_empty());
                    assert_not_pd_warned(&reason, &res.structured_diagnostics);
                    *reasons.entry(reason.chars().take(40).collect()).or_default() += 1;
                    unc += 1;
                }
            }
        }
    }
    eprintln!("fuzz: {solved} solved, {cert} certified, {unc} uncertified: {reasons:?}");
    assert!(cert > 0);
}

// ───────────────────────── constraints and inclined supports ─────────────────────────
//
// Reference for the transformed systems: the exact solution of
//   find q:  Cᵀ (f_F − K_F· [C q + C_R u_R ; u_R]) = 0,   u_F = C q + C_R u_R,
// in the solver's (rotated) axes, then u_glob = Tᵀ u_rot. Residuals are
// evaluated in double-double straight from K, C, f — the reduced matrix CᵀKC is
// never rounded — and refined with an f64 LU of CᵀKC as preconditioner.

use dedaliano_engine::solver::assembly::{assemble_2d, assemble_sparse_3d, InclinedTransformData, InclinedTransformData2D};
use dedaliano_engine::solver::constraints::{build_constraint_transform, inclined_dofs_2d, inclined_dofs_3d};

struct GenSystem {
    label: String,
    k: Vec<f64>,
    n: usize,
    nf: usize,
    f: Vec<f64>,
    c: Vec<Vec<(usize, f64)>>,
    c_r: Vec<Vec<(usize, f64)>>,
    p: usize,
    u_r: Vec<f64>,
    rots: Vec<(Vec<usize>, Vec<f64>)>,
    u_glob: Vec<f64>,
}

fn identity_map(nf: usize) -> (Vec<Vec<(usize, f64)>>, Vec<Vec<(usize, f64)>>, usize) {
    ((0..nf).map(|i| vec![(i, 1.0)]).collect(), vec![vec![]; nf], nf)
}

fn constraint_map(
    ct: &dedaliano_engine::solver::constraints::ConstraintTransform,
    nf: usize,
) -> (Vec<Vec<(usize, f64)>>, Vec<Vec<(usize, f64)>>, usize) {
    let mut col = vec![usize::MAX; ct.n_independent];
    let mut p = 0;
    for (j, &d) in ct.independent_dofs.iter().enumerate() {
        if d < nf {
            col[j] = p;
            p += 1;
        }
    }
    let (mut c, mut c_r) = (vec![vec![]; nf], vec![vec![]; nf]);
    for i in 0..nf {
        for q in ct.c.row_ptr[i]..ct.c.row_ptr[i + 1] {
            let (j, v) = (ct.c.col_idx[q], ct.c.vals[q]);
            if col[j] != usize::MAX {
                c[i].push((col[j], v));
            } else {
                c_r[i].push((ct.independent_dofs[j] - nf, v));
            }
        }
    }
    (c, c_r, p)
}

/// Dense K from the sparse pair the solver uses: K_FF from k_ff, the rest from k_full.
fn dense_from_pair(k_ff: &CscMatrix, k_full: &CscMatrix) -> Vec<f64> {
    let n = k_full.n;
    let mut d = dense_from_lower(k_full);
    let ff = dense_from_lower(k_ff);
    let nf = k_ff.n;
    for i in 0..nf {
        d[i * n..i * n + nf].copy_from_slice(&ff[i * nf..(i + 1) * nf]);
    }
    d
}

fn rots_2d(its: &[InclinedTransformData2D]) -> Vec<(Vec<usize>, Vec<f64>)> {
    its.iter().map(|it| (it.dofs.to_vec(), vec![it.r[0][0], it.r[0][1], it.r[1][0], it.r[1][1]])).collect()
}

fn rots_3d(its: &[InclinedTransformData]) -> Vec<(Vec<usize>, Vec<f64>)> {
    its.iter().map(|it| (it.dofs.to_vec(), it.r.iter().flatten().copied().collect())).collect()
}

/// u_R in the solver's axes: returned values, except the normal DOF of an
/// inclined support, which gets the prescribed normal displacement.
fn restrained_values(nf: usize, u_glob: &[f64], normals: &[(usize, f64)]) -> Vec<f64> {
    let mut u_r = u_glob[nf..].to_vec();
    for &(d, v) in normals {
        if d >= nf {
            u_r[d - nf] = v;
        }
    }
    u_r
}

fn gen_2d(label: &str, input: &SolverInput, res: &AnalysisResults) -> GenSystem {
    let dof = DofNumbering::build_2d(input);
    let (n, nf) = (dof.n_total, dof.n_free);
    let sparse = if input.constraints.is_empty() {
        nf >= SPARSE_THRESHOLD
    } else {
        nf >= SPARSE_THRESHOLD && res.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::SparseCholesky)
    };
    let (k, f, its) = if sparse {
        let st = assemble_stiffness_sparse_2d(input, &dof);
        let f = assemble_load_vector_2d(input, &input.loads, &dof, &st.inclined_transforms_2d);
        (dense_from_pair(&st.k_ff, &st.k_full), f, st.inclined_transforms_2d)
    } else if input.constraints.is_empty() {
        let st = assemble_stiffness_2d(input, &dof);
        let f = assemble_load_vector_2d(input, &input.loads, &dof, &st.inclined_transforms_2d);
        (st.k, f, st.inclined_transforms_2d)
    } else {
        let a = assemble_2d(input, &dof);
        (a.k, a.f, a.inclined_transforms_2d)
    };
    let d: HashMap<usize, &Displacement> = res.displacements.iter().map(|d| (d.node_id, d)).collect();
    let mut u_glob = vec![0.0; n];
    for (&(node, l), &g) in &dof.map {
        let x = d[&node];
        u_glob[g] = [x.ux, x.uz, x.ry][l];
    }
    let normals: Vec<(usize, f64)> = its
        .iter()
        .map(|it| {
            let s = input.supports.values().find(|s| s.node_id == it.node_id).unwrap();
            let th = s.angle.unwrap();
            let un = s.dx.unwrap_or(0.0) * th.sin() + s.dz.unwrap_or(0.0) * th.cos();
            (it.dofs[1], if un.abs() > 1e-15 { un } else { 0.0 })
        })
        .collect();
    let (c, c_r, p) = if input.constraints.is_empty() {
        identity_map(nf)
    } else {
        constraint_map(&build_constraint_transform(&input.constraints, &dof, Some(&input.nodes), None, &inclined_dofs_2d(input, &dof)).unwrap(), nf)
    };
    GenSystem {
        label: label.into(), k, n, nf, f, c, c_r, p,
        u_r: restrained_values(nf, &u_glob, &normals),
        rots: rots_2d(&its),
        u_glob,
    }
}

fn gen_3d(label: &str, input: &SolverInput3D, res: &AnalysisResults3D) -> GenSystem {
    let input = &expand_curved_beams_3d(input);
    let dof = DofNumbering::build_3d(input);
    let (n, nf) = (dof.n_total, dof.n_free);
    let (k, f, its) = if !input.constraints.is_empty() {
        let a = assemble_sparse_3d(input, &dof, true);
        (dense_from_pair(&a.k_ff, a.k_full.as_ref().unwrap()), a.f, a.inclined_transforms)
    } else if nf >= SPARSE_THRESHOLD {
        let st = assemble_stiffness_sparse_3d(input, &dof, true);
        let f = assemble_load_vector_sparse_3d(input, &input.loads, &dof, &st.inclined_transforms);
        (dense_from_pair(&st.k_ff, st.k_full.as_ref().unwrap()), f, st.inclined_transforms)
    } else {
        let st = assemble_stiffness_3d(input, &dof);
        let f = assemble_load_vector_3d_dense(input, &input.loads, &dof, &st.inclined_transforms);
        (st.k, f, st.inclined_transforms)
    };
    let d: HashMap<usize, &Displacement3D> = res.displacements.iter().map(|d| (d.node_id, d)).collect();
    let mut u_glob = vec![0.0; n];
    for (&(node, l), &g) in &dof.map {
        let x = d[&node];
        u_glob[g] = [x.ux, x.uy, x.uz, x.rx, x.ry, x.rz, x.warping.unwrap_or(0.0)][l];
    }
    let normals: Vec<(usize, f64)> = its
        .iter()
        .map(|it| {
            let s = input.supports.values().find(|s| s.node_id == it.node_id).unwrap();
            let (nx, ny, nz) = (s.normal_x.unwrap(), s.normal_y.unwrap(), s.normal_z.unwrap());
            let len = (nx * nx + ny * ny + nz * nz).sqrt();
            let un = (nx * s.dx.unwrap_or(0.0) + ny * s.dy.unwrap_or(0.0) + nz * s.dz.unwrap_or(0.0)) / len;
            (it.dofs[0], if un.abs() > 1e-15 { un } else { 0.0 })
        })
        .collect();
    let (c, c_r, p) = if input.constraints.is_empty() {
        identity_map(nf)
    } else {
        constraint_map(&build_constraint_transform(&input.constraints, &dof, None, Some(&input.nodes), &inclined_dofs_3d(input, &dof)).unwrap(), nf)
    };
    GenSystem {
        label: label.into(), k, n, nf, f, c, c_r, p,
        u_r: restrained_values(nf, &u_glob, &normals),
        rots: rots_3d(&its),
        u_glob,
    }
}

/// ‖u*_glob − ũ_glob‖₂ over all DOFs, from the double-double reference.
fn gen_true_error(s: &GenSystem) -> f64 {
    let (n, nf, p) = (s.n, s.nf, s.p);
    // f64 CᵀK_FF C, only as a preconditioner.
    let mut a = vec![0.0; p * p];
    for i in 0..nf {
        for j in 0..nf {
            let kij = s.k[i * n + j];
            if kij == 0.0 {
                continue;
            }
            for &(x, cx) in &s.c[i] {
                for &(y, cy) in &s.c[j] {
                    a[x * p + y] += cx * kij * cy;
                }
            }
        }
    }
    let piv = lu_factor(&mut a, p).expect("reference: CᵀKC singular");
    let (mut qh, mut ql) = (vec![0.0; p], vec![0.0; p]);
    let expand = |qh: &[f64], ql: &[f64]| -> (Vec<f64>, Vec<f64>) {
        let (mut wh, mut wl) = (vec![0.0; n], vec![0.0; n]);
        for i in 0..nf {
            let mut acc = Acc::default();
            for &(x, cx) in &s.c[i] {
                acc.add_prod(cx, qh[x]);
                acc.add_prod(cx, ql[x]);
            }
            for &(r, cr) in &s.c_r[i] {
                acc.add_prod(cr, s.u_r[r]);
            }
            (wh[i], wl[i]) = acc.hi_lo();
        }
        wh[nf..].copy_from_slice(&s.u_r);
        (wh, wl)
    };
    for _ in 0..30 {
        let (wh, wl) = expand(&qh, &ql);
        let mut t = vec![(0.0, 0.0); nf];
        for (i, ti) in t.iter_mut().enumerate() {
            let mut acc = Acc::default();
            acc.add(s.f[i]);
            for j in 0..n {
                let kij = s.k[i * n + j];
                if kij != 0.0 {
                    acc.add_prod(-kij, wh[j]);
                    acc.add_prod(-kij, wl[j]);
                }
            }
            *ti = acc.hi_lo();
        }
        let mut r = vec![Acc::default(); p];
        for i in 0..nf {
            for &(x, cx) in &s.c[i] {
                r[x].add_prod(cx, t[i].0);
                r[x].add_prod(cx, t[i].1);
            }
        }
        let r: Vec<f64> = r.into_iter().map(|a| a.hi_lo().0).collect();
        let dq = lu_apply(&a, &piv, &r, p).expect("reference solve");
        for x in 0..p {
            let (h, e) = two_sum(qh[x], dq[x]);
            (qh[x], ql[x]) = two_sum(h, ql[x] + e);
        }
    }
    let (mut uh, mut ul) = expand(&qh, &ql);
    // Back to global axes: u_glob[dofs] = Rᵀ u_rot[dofs].
    for (dofs, r) in &s.rots {
        let m = dofs.len();
        let (rh, rl): (Vec<f64>, Vec<f64>) = dofs.iter().map(|&d| (uh[d], ul[d])).unzip();
        for a in 0..m {
            let mut acc = Acc::default();
            for b in 0..m {
                acc.add_prod(r[b * m + a], rh[b]);
                acc.add_prod(r[b * m + a], rl[b]);
            }
            (uh[dofs[a]], ul[dofs[a]]) = acc.hi_lo();
        }
    }
    let mut e2 = 0.0f64;
    for i in 0..n {
        let (d, e) = two_sum(s.u_glob[i], -uh[i]);
        let di = d + (e - ul[i]);
        e2 += di * di;
    }
    e2.sqrt()
}

fn assert_honest_gen(cert: &Certificate, s: &GenSystem) -> (f64, f64) {
    let Certificate::Certified { abs_bound, .. } = cert else {
        panic!("{}: expected certified, got {cert:?}", s.label);
    };
    let err = gen_true_error(s);
    assert!(err <= *abs_bound, "{}: true error {err:e} exceeds bound {abs_bound:e}", s.label);
    eprintln!("{}: n={} p={} abs={abs_bound:.2e} err={err:.2e}", s.label, s.n, s.p);
    (*abs_bound, err)
}

fn tied_columns_2d() -> SolverInput {
    let mut input = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, 3.0), (3, 4.0, 0.0), (4, 4.0, 3.0), (5, 2.0, 3.5)],
        vec![(1, 30_000.0, 0.2)],
        vec![(1, 0.09, 6.75e-4)],
        vec![
            (1, "frame", 1, 2, 1, 1, false, false),
            (2, "frame", 3, 4, 1, 1, false, false),
            (3, "frame", 2, 5, 1, 1, false, false),
        ],
        vec![(1, 1, "fixed"), (2, 3, "fixed")],
        vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 10.0, fz: -3.0, my: 0.0 }),
            SolverLoad::Nodal(SolverNodalLoad { node_id: 5, fx: 0.0, fz: -7.0, my: 1.0 }),
        ],
    );
    input.constraints = vec![
        Constraint::EqualDOF(EqualDOFConstraint { master_node: 2, slave_node: 4, dofs: vec![0] }),
        Constraint::RigidLink(RigidLinkConstraint { master_node: 5, slave_node: 4, dofs: vec![1] }),
    ];
    input
}

#[test]
fn certify_constraints_2d() {
    // Small (dense constrained path): ties, a rigid link, and a settling master.
    let mut cases = vec![("tied columns", tied_columns_2d())];
    let mut settle = tied_columns_2d();
    settle.supports.get_mut("1").unwrap().dx = Some(0.005);
    settle.constraints.push(Constraint::EqualDOF(EqualDOFConstraint { master_node: 1, slave_node: 5, dofs: vec![0] }));
    cases.push(("tied to settling support", settle));
    // Large (sparse constrained path): a grid frame with every floor's ux tied.
    let mut grid = grid_frame(6, 15);
    let id = |c: usize, s: usize| s * 7 + c + 1;
    for s in 1..=15 {
        for c in 1..=6 {
            grid.constraints.push(Constraint::EqualDOF(EqualDOFConstraint {
                master_node: id(0, s), slave_node: id(c, s), dofs: vec![0],
            }));
        }
    }
    cases.push(("tied grid 6x15", grid));
    for (name, input) in cases {
        let (res, cert) = certify_linear_2d(&input).unwrap();
        if name.contains("grid") {
            let sparse = res.structured_diagnostics.iter().any(|d| d.code == DiagnosticCode::SparseCholesky);
            assert!(sparse, "{name}: expected the sparse constrained path");
        }
        let s = gen_2d(name, &input, &res);
        let (abs, _) = assert_honest_gen(&cert, &s);
        assert!(abs < 1e-8 * norm(&s.u_glob), "{name}: bound unexpectedly loose: {abs:e}");
    }
}

/// Diaphragms on every floor of a 3D building fixture, plus small tied models.
#[test]
fn certify_constraints_3d() {
    let mut cases = vec![];
    let mut tied = make_3d_input(
        vec![(1, 0.0, 0.0, 0.0), (2, 0.0, 0.0, 3.0), (3, 4.0, 0.0, 0.0), (4, 4.0, 0.0, 3.0)],
        vec![(1, 30_000.0, 0.2)],
        vec![(1, 0.09, 6.75e-4, 6.75e-4, 1.14e-3)],
        vec![(1, "frame", 1, 2, 1, 1), (2, "frame", 3, 4, 1, 1)],
        vec![(1, vec![true; 6]), (3, vec![true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 10.0, fy: 2.0, fz: 0.0, mx: 0.0, my: 0.0, mz: 0.3, bw: None })],
    );
    tied.constraints = vec![Constraint::RigidLink(RigidLinkConstraint { master_node: 2, slave_node: 4, dofs: vec![] })];
    cases.push(("3d rigid link".to_string(), tied.clone()));
    for sup in tied.supports.values_mut() {
        if sup.node_id == 1 {
            sup.dx = Some(0.004);
        }
    }
    tied.constraints = vec![Constraint::EqualDOF(EqualDOFConstraint { master_node: 1, slave_node: 4, dofs: vec![0] })];
    cases.push(("3d tied to settling support".to_string(), tied));
    for case in ["ex-3d-building-case1", "ex-3d-building-case3"] {
        let path = format!("{}/tests/fixtures/{case}-input.json", env!("CARGO_MANIFEST_DIR"));
        let mut input: SolverInput3D = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        let mut floors: HashMap<u64, Vec<usize>> = HashMap::new();
        let supported: Vec<usize> = input.supports.values().map(|s| s.node_id).collect();
        for n in input.nodes.values() {
            if !supported.contains(&n.id) {
                floors.entry(n.y.to_bits()).or_default().push(n.id);
            }
        }
        for mut ids in floors.into_values() {
            ids.sort();
            input.constraints.push(Constraint::Diaphragm(DiaphragmConstraint {
                master_node: ids[0], slave_nodes: ids[1..].to_vec(), plane: "XZ".into(),
            }));
        }
        cases.push((format!("{case} + diaphragms"), input));
    }
    for (name, input) in cases {
        let (res, cert) = certify_linear_3d(&input).unwrap();
        let s = gen_3d(&name, &input, &res);
        let (abs, _) = assert_honest_gen(&cert, &s);
        assert!(abs < 1e-6 * norm(&s.u_glob), "{name}: bound unexpectedly loose: {abs:e}");
    }
}

fn inclined_portal(angle: f64, settle: Option<f64>) -> SolverInput {
    let mut input = portal();
    let sup = input.supports.values_mut().find(|s| s.node_id == 4).unwrap();
    sup.support_type = "inclinedRoller".into();
    sup.angle = Some(angle);
    sup.dx = settle;
    input
}

#[test]
fn certify_inclined_supports_2d() {
    let mut cases = vec![
        ("inclined 0.3".to_string(), inclined_portal(0.3, None)),
        ("inclined 45deg".to_string(), inclined_portal(std::f64::consts::FRAC_PI_4, None)),
        ("inclined settling".to_string(), inclined_portal(1.1, Some(0.002))),
    ];
    // Large (sparse path): a grid frame whose base supports are inclined rollers.
    let mut grid = grid_frame(6, 15);
    for (k, sup) in grid.supports.values_mut().enumerate() {
        if k % 2 == 1 {
            sup.support_type = "inclinedRoller".into();
            sup.angle = Some(0.2 + 0.1 * k as f64);
        }
    }
    cases.push(("inclined grid".into(), grid));
    // Constraints and an inclined support together.
    let mut both = tied_columns_2d();
    let sup = both.supports.values_mut().find(|s| s.node_id == 3).unwrap();
    sup.support_type = "inclinedRoller".into();
    sup.angle = Some(0.4);
    cases.push(("inclined + constraints".into(), both));
    for (name, input) in cases {
        let (res, cert) = certify_linear_2d(&input).unwrap();
        let s = gen_2d(&name, &input, &res);
        let (abs, _) = assert_honest_gen(&cert, &s);
        assert!(abs < 1e-8 * norm(&s.u_glob), "{name}: bound unexpectedly loose: {abs:e}");
    }
}

#[test]
fn certify_inclined_supports_3d() {
    let s2 = std::f64::consts::FRAC_1_SQRT_2;
    let mut input = make_3d_beam(
        8, 6.0, 200_000.0, 0.3, 0.01, 1e-4, 2e-4, 1e-5,
        vec![true; 6], Some(vec![false; 6]),
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D {
            node_id: 5, fx: 1.0, fy: -3.0, fz: 2.0, mx: 0.1, my: 0.0, mz: 0.0, bw: None,
        })],
    );
    pin_legacy_local_axes(&mut input);
    let end = input.supports.values_mut().find(|s| s.node_id == 9).unwrap();
    end.normal_x = Some(s2);
    end.normal_y = Some(s2);
    end.normal_z = Some(0.0);
    end.is_inclined = Some(true);
    end.rrx = true;
    let mut cases = vec![("3d inclined end".to_string(), input.clone())];
    let end = input.supports.values_mut().find(|s| s.node_id == 9).unwrap();
    end.dx = Some(1e-3);
    end.normal_z = Some(0.4);
    cases.push(("3d inclined settling".to_string(), input.clone()));
    input.constraints = vec![Constraint::EqualDOF(EqualDOFConstraint { master_node: 3, slave_node: 7, dofs: vec![2] })];
    cases.push(("3d inclined + constraint".to_string(), input));
    for (name, input) in cases {
        let (res, cert) = certify_linear_3d(&input).unwrap();
        let s = gen_3d(&name, &input, &res);
        let (abs, _) = assert_honest_gen(&cert, &s);
        assert!(abs < 1e-8 * norm(&s.u_glob), "{name}: bound unexpectedly loose: {abs:e}");
    }
}

/// Wrong inputs are refused or covered: perturbed displacements (the bound
/// must cover the perturbation, including a constraint violation), and a
/// constraint set that leaves a mechanism is never certified.
#[test]
fn constrained_certificate_refuses_wrong_inputs() {
    use dedaliano_engine::certify::certify_results_2d;
    let input = tied_columns_2d();
    let res = solve_2d(&input).unwrap();
    // Break the tie on the slave only: ũ violates u4x = u2x by 1e-4.
    let mut bad = res.clone();
    let d4 = bad.displacements.iter_mut().find(|d| d.node_id == 4).unwrap();
    d4.ux += 1e-4;
    let cert = certify_results_2d(&input, &bad);
    let s = gen_2d("perturbed slave", &input, &bad);
    let (abs, err) = assert_honest_gen(&cert, &s);
    assert!(err >= 1e-4 * 0.99 && abs >= err);
    // Perturb a master: covered as well.
    let mut bad = res.clone();
    for d in bad.displacements.iter_mut() {
        d.uz += 1e-5 * d.node_id as f64;
    }
    let cert = certify_results_2d(&input, &bad);
    assert_honest_gen(&cert, &gen_2d("perturbed all", &input, &bad));

    // Pinned-base columns tied at the top by ux only, with the beam to node 5
    // removed and hinges at both column tops: the tied pair still sways.
    let mut mech = make_input(
        vec![(1, 0.0, 0.0), (2, 0.0, 3.0), (3, 4.0, 0.0), (4, 4.0, 3.0)],
        vec![(1, 30_000.0, 0.2)],
        vec![(1, 0.09, 6.75e-4)],
        vec![(1, "frame", 1, 2, 1, 1, false, false), (2, "frame", 3, 4, 1, 1, false, false)],
        vec![(1, 1, "pinned"), (2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 10.0, fz: 0.0, my: 0.0 })],
    );
    mech.constraints = vec![Constraint::EqualDOF(EqualDOFConstraint { master_node: 2, slave_node: 4, dofs: vec![0] })];
    assert_never_certified("tied sway mechanism", certify_linear_2d(&mech));
}

/// Full certified results: member and shell bounds come with a certificate,
/// and never without one.
#[test]
fn full_results_bounds_only_when_certified() {
    use dedaliano_engine::certify::certify_linear_3d_full;
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ex-3d-grid-slab-input.json");
    let input: SolverInput3D = serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
    let full = certify_linear_3d_full(&input).unwrap();
    assert!(full.certificate.is_certified());
    assert_eq!(full.force_bounds.len(), input.elements.len());
    assert_eq!(full.shell_bounds.len(), input.quads.len() + input.plates.len() + input.quad9s.len());
    // A constrained MITC4 strip: certified, with a bound per quad.
    let (nx, ny) = (4usize, 2usize);
    let id = |i: usize, j: usize| i * (ny + 1) + j + 1;
    let mut shell = make_3d_input(
        (0..=nx).flat_map(|i| (0..=ny).map(move |j| (id(i, j), i as f64, 0.5 * j as f64, 0.2 * j as f64))).collect(),
        vec![(1, 30_000.0, 0.25)],
        vec![],
        vec![],
        (0..=ny).map(|j| (id(0, j), vec![true; 6])).collect(),
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: id(nx, 1), fx: 1.0, fy: 0.5, fz: -2.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );
    let mut q = 1;
    for i in 0..nx {
        for j in 0..ny {
            shell.quads.insert(q.to_string(), SolverQuadElement {
                id: q, nodes: [id(i, j), id(i + 1, j), id(i + 1, j + 1), id(i, j + 1)], material_id: 1, thickness: 0.05,
            });
            q += 1;
        }
    }
    shell.constraints = vec![Constraint::EqualDOF(EqualDOFConstraint { master_node: id(nx, 0), slave_node: id(nx, 2), dofs: vec![2] })];
    let full = certify_linear_3d_full(&shell).unwrap();
    assert_honest_gen(&full.certificate, &gen_3d("constrained MITC4 strip", &shell, &full.results));
    assert_eq!(full.shell_bounds.len(), shell.quads.len());
    assert!(full.shell_bounds.iter().all(|b| b.mx > 0.0 && b.qx.is_some()));
    // A non-positive-definite model the solver still answers: no bounds at all.
    let bad = fuzz_models::random_3d_model(100_031);
    let full = certify_linear_3d_full(&bad).unwrap();
    assert!(!full.certificate.is_certified());
    assert!(full.force_bounds.is_empty() && full.shell_bounds.is_empty());
}

/// σ must be positive and finite. A negative σ makes `S − σI` positive
/// definite for any symmetric K with λ_min > σ, and the bound ρ/σ would be
/// negative; σ = 0 or +∞ give no bound. (Mutants on the σ guard in
/// certify_linear_system_interval_rhs survived without this test.)
#[test]
fn linear_certificate_rejects_nonpositive_or_infinite_sigma() {
    // K = diag(2, 3), f = (2, 3), ũ = (1, 1) slightly perturbed so ρ > 0.
    let k = [2.0, 0.0, 0.0, 3.0];
    let f = [2.0, 3.0];
    let u = [1.0 + 1e-9, 1.0];
    assert!(certify_linear_system(&k, 2, &f, &u, 1.0).is_certified(), "σ = 1 ≤ λ_min = 2 certifies");
    for sigma in [-1.0, -0.5, 0.0, f64::INFINITY, f64::NAN] {
        let c = certify_linear_system(&k, 2, &f, &u, sigma);
        assert!(!c.is_certified(), "σ = {sigma} must not certify: {c:?}");
    }
}

/// Mismatched dimensions are uncertified, never a panic or a certificate of
/// a different system. (Mutants `||` → `&&` in check_inputs survived.)
#[test]
fn linear_certificate_rejects_mismatched_dimensions() {
    let k = [2.0, 0.0, 0.0, 3.0];
    let ok = |c: Certificate| !c.is_certified();
    assert!(ok(certify_linear_system(&k[..3], 2, &[2.0, 3.0], &[1.0, 1.0], 1.0)), "short K");
    assert!(ok(certify_linear_system(&k, 2, &[2.0], &[1.0, 1.0], 1.0)), "short f");
    assert!(ok(certify_linear_system(&k, 2, &[2.0, 3.0], &[1.0], 1.0)), "short ũ");
    assert!(ok(certify_linear_system(&k, 2, &[2.0, 3.0, 4.0], &[1.0, 1.0, 1.0], 1.0)), "long f and ũ");
}

/// A σ above λ_min(S) must fail even when it is below every diagonal entry:
/// only the Schur-complement pivots reveal it. K = [[2, 1.9], [1.9, 2]] has
/// λ_min = 0.1; σ = 1 leaves the second pivot 1 − 1.9² < 0. (Mutants that
/// added, instead of subtracting, Σ L_ip² in the interval Cholesky survived
/// and would certify a too-small bound.)
#[test]
fn linear_certificate_needs_every_pivot_positive() {
    let k = [2.0, 1.9, 1.9, 2.0];
    let f = [3.9, 3.9];
    let u = [1.0 + 1e-6, 1.0 - 1e-6]; // exact solution (1, 1)
    for sigma in [1.0, 0.5, 0.2] {
        let c = certify_linear_system(&k, 2, &f, &u, sigma);
        assert!(!c.is_certified(), "σ = {sigma} > λ_min = 0.1 must not certify: {c:?}");
    }
    let c = certify_linear_system(&k, 2, &f, &u, 0.09);
    let Certificate::Certified { abs_bound, .. } = c else { panic!("σ = 0.09 < λ_min certifies: {c:?}") };
    let err = (2.0f64 * 1e-12).sqrt();
    assert!(abs_bound >= err, "bound {abs_bound} below the true error {err}");
}

/// A beam of `n` frame elements: pinned at node 1 with a settlement, a roller
/// with a settlement at mid-length, a plain roller at the end, a load at mid-span.
fn settled_beam(n: usize) -> SolverInput {
    let mut input = make_beam(n, 12.0, 200000.0, 0.01, 1e-4, "pinned", Some("rollerX"), vec![
        SolverLoad::Nodal(SolverNodalLoad { node_id: n / 4 + 1, fx: 0.0, fz: -20.0, my: 0.0 }),
    ]);
    let s1 = input.supports.values_mut().find(|s| s.node_id == 1).unwrap();
    s1.dz = Some(-0.01);
    s1.dx = Some(0.002);
    let mid = n / 2 + 1;
    let mut s = input.supports.values().next().unwrap().clone();
    (s.id, s.node_id, s.support_type, s.dx, s.dz) = (99, mid, "rollerX".into(), None, Some(-0.005));
    input.supports.insert("99".into(), s);
    input
}

/// Certified results with prescribed support displacements: the restrained
/// columns K_FR·u_R enter the right-hand side, so the bound is tight (a
/// certificate that dropped them would be honest but loose). Both the dense
/// (n_free < 64) and the sparse path. (Mutants of the settlement terms in
/// PreparedK::certify survived without this test.)
#[test]
fn certified_settlements_are_tight() {
    for n in [6, 40] {
        let input = settled_beam(n);
        let (res, cert) = certify_linear_2d(&input).unwrap();
        let r = reduced_2d(&input, &res);
        let label = format!("settled beam, {n} elements");
        let (_, rel, _) = assert_honest(&label, &cert, &r);
        assert!(rel < 1e-8, "{label}: relative bound {rel} is not tight");
        let mid = res.displacements.iter().find(|d| d.node_id == n / 2 + 1).unwrap();
        assert!((mid.uz + 0.005).abs() < 1e-12, "{label}: settlement not applied: {mid:?}");
    }
}

/// 3D beam of `n` frame elements along x, fixed at node 1, on an inclined
/// roller at the tip with a skew normal and a prescribed displacement.
fn inclined_settled_beam_3d(n: usize) -> SolverInput3D {
    let mut nodes = serde_json::Map::new();
    let mut elements = serde_json::Map::new();
    for i in 0..=n {
        nodes.insert((i + 1).to_string(), serde_json::json!({ "id": i + 1, "x": 6.0 * i as f64 / n as f64, "y": 0.0, "z": 0.0 }));
        if i < n {
            elements.insert((i + 1).to_string(), serde_json::json!({
                "id": i + 1, "type": "frame", "nodeI": i + 1, "nodeJ": i + 2, "materialId": 1, "sectionId": 1
            }));
        }
    }
    serde_json::from_value(serde_json::json!({
        "nodes": nodes, "elements": elements,
        "materials": { "1": { "id": 1, "e": 200000.0, "nu": 0.3 } },
        "sections": { "1": { "id": 1, "a": 0.01, "iy": 1e-4, "iz": 5e-5, "j": 3e-5 } },
        "supports": {
            "1": { "nodeId": 1, "rx": true, "ry": true, "rz": true, "rrx": true, "rry": true, "rrz": true },
            "2": { "nodeId": n + 1, "rx": false, "ry": false, "rz": false, "rrx": false, "rry": false, "rrz": false,
                   "isInclined": true, "normalX": 0.3, "normalY": 0.4, "normalZ": 0.866,
                   "dx": 0.001, "dy": -0.002, "dz": -0.004 }
        },
        "loads": [{ "type": "nodal", "data": { "nodeId": n / 2 + 1, "fx": 1.0, "fy": 2.0, "fz": -10.0, "mx": 0.0, "my": 0.0, "mz": 0.0 } }]
    }))
    .unwrap()
}

/// Inclined supports with a prescribed displacement along the normal: the
/// certificate is tight and the solution meets u·n̂ = d·n̂ (dense and sparse
/// paths). (Mutants of the prescribed normal value in rotated_candidate_3d
/// survived without this test.)
#[test]
fn certified_inclined_settlement_3d_is_tight() {
    for n in [3, 15] {
        let input = inclined_settled_beam_3d(n);
        let (res, cert) = certify_linear_3d(&input).unwrap();
        let Certificate::Certified { rel_bound, .. } = cert else { panic!("{n} elements: not certified: {cert:?}") };
        assert!(rel_bound < 1e-8, "{n} elements: relative bound {rel_bound} is not tight");
        let (nx, ny, nz) = (0.3, 0.4, 0.866);
        let len = (nx * nx + ny * ny + nz * nz as f64).sqrt();
        let tip = res.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
        let un = (tip.ux * nx + tip.uy * ny + tip.uz * nz) / len;
        let dn = (0.001 * nx - 0.002 * ny - 0.004 * nz) / len;
        assert!((un - dn).abs() < 1e-9, "{n} elements: u·n̂ = {un}, prescribed {dn}");
    }
}

/// 2D version: an inclined roller with a prescribed displacement.
#[test]
fn certified_inclined_settlement_2d_is_tight() {
    for n in [6, 40] {
        let mut input = make_beam(n, 12.0, 200000.0, 0.01, 1e-4, "fixed", None, vec![
            SolverLoad::Nodal(SolverNodalLoad { node_id: n / 2 + 1, fx: 3.0, fz: -20.0, my: 0.0 }),
        ]);
        let mut s = input.supports.values().next().unwrap().clone();
        (s.id, s.node_id, s.support_type) = (2, n + 1, "inclinedRoller".into());
        (s.angle, s.dx, s.dz) = (Some(0.35), Some(0.002), Some(-0.003));
        input.supports.insert("2".into(), s);
        let (res, cert) = certify_linear_2d(&input).unwrap();
        let Certificate::Certified { rel_bound, .. } = cert else { panic!("{n} elements: not certified: {cert:?}") };
        assert!(rel_bound < 1e-8, "{n} elements: relative bound {rel_bound} is not tight");
        let tip = res.displacements.iter().find(|d| d.node_id == n + 1).unwrap();
        let (c, s) = (0.35f64.cos(), 0.35f64.sin());
        let (un, dn) = (tip.ux * s + tip.uz * c, 0.002 * s - 0.003 * c);
        assert!((un - dn).abs() < 1e-9, "{n} elements: normal displacement {un}, prescribed {dn}");
    }
}
