//! Certified P-Delta, spectral and harmonic results (docs/verification/CERTIFY.md).
//!
//! Honesty references are independent high-accuracy solutions of the same model:
//! P-Delta by Newton's method with the residual evaluated in double-double
//! arithmetic (so the reference fixed point is accurate to ~κ·ε²).

mod common;

use common::*;
use dedaliano_engine::certify::pdelta::{
    certify_pdelta_2d, certify_pdelta_3d, certify_pdelta_results_2d, PDeltaCertificate,
};
use dedaliano_engine::linalg::{lu_apply, lu_factor, CscMatrix};
use dedaliano_engine::solver::assembly::{assemble_load_vector_2d, assemble_sparse_3d};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::geometric_stiffness::{
    geometric_stiffness_terms_2d, geometric_stiffness_terms_3d, KgAffineTerm,
};
use dedaliano_engine::solver::buckling::solve_buckling_2d;
use dedaliano_engine::solver::pdelta::solve_pdelta_2d;
use dedaliano_engine::solver::sparse_assembly::assemble_stiffness_sparse_2d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ───────────────────────── double-double ─────────────────────────

fn two_sum(a: f64, b: f64) -> (f64, f64) {
    let s = a + b;
    let bb = s - a;
    (s, (a - (s - bb)) + (b - bb))
}

fn two_prod(a: f64, b: f64) -> (f64, f64) {
    let p = a * b;
    (p, a.mul_add(b, -p))
}

#[derive(Clone, Copy, Debug, Default)]
struct DD {
    hi: f64,
    lo: f64,
}

impl DD {
    fn new(x: f64) -> DD {
        DD { hi: x, lo: 0.0 }
    }
    fn norm(s: f64, e: f64) -> DD {
        let (hi, lo) = two_sum(s, e);
        DD { hi, lo }
    }
    fn add(self, b: DD) -> DD {
        let (s, e) = two_sum(self.hi, b.hi);
        DD::norm(s, e + self.lo + b.lo)
    }
    fn neg(self) -> DD {
        DD { hi: -self.hi, lo: -self.lo }
    }
    fn sub(self, b: DD) -> DD {
        self.add(b.neg())
    }
    fn mul(self, b: DD) -> DD {
        let (p, e) = two_prod(self.hi, b.hi);
        DD::norm(p, e + self.hi * b.lo + self.lo * b.hi)
    }
    fn mulf(self, b: f64) -> DD {
        self.mul(DD::new(b))
    }
    fn divf(self, d: f64) -> DD {
        let q1 = self.hi / d;
        let r = self.sub(DD::new(q1).mulf(d));
        DD::norm(q1, r.hi / d)
    }
}

// ───────────────────────── P-Delta reference ─────────────────────────

/// The certificate's model: lower-triangle full K, f, affine K_G terms.
struct PdModel {
    k: CscMatrix,
    nf: usize,
    f: Vec<f64>,
    terms: Vec<KgAffineTerm>,
}

fn pd_model_2d(input: &SolverInput) -> (PdModel, DofNumbering) {
    let dof = DofNumbering::build_2d(input);
    let k = assemble_stiffness_sparse_2d(input, &dof).k_full;
    let f = assemble_load_vector_2d(input, &input.loads, &dof, &[]);
    let terms = geometric_stiffness_terms_2d(input, &dof);
    (PdModel { k, nf: dof.n_free, f, terms }, dof)
}

fn pd_model_3d(input: &SolverInput3D) -> (PdModel, DofNumbering) {
    let dof = DofNumbering::build_3d(input);
    let asm = assemble_sparse_3d(input, &dof, true);
    let terms = geometric_stiffness_terms_3d(input, &dof);
    (PdModel { k: asm.k_full.unwrap(), nf: dof.n_free, f: asm.f, terms }, dof)
}

impl PdModel {
    fn axial(&self, t: &KgAffineTerm, x: &[DD]) -> DD {
        let d = t.elongation.iter().fold(DD::default(), |s, &(i, c)| s.add(x[i].mulf(c)));
        let th = DD::new(t.alpha).mulf(t.dt);
        DD::new(t.e).mulf(t.a).mul(d.divf(t.l).sub(th))
    }

    fn gx(t: &KgAffineTerm, x: &[DD]) -> Vec<DD> {
        let nd = t.dofs.len();
        (0..nd).map(|a| (0..nd).fold(DD::default(), |s, b| s.add(x[t.dofs[b]].mulf(t.g[a * nd + b])))).collect()
    }

    /// F(x) on the free rows, in double-double.
    fn residual(&self, x: &[DD]) -> Vec<DD> {
        let nf = self.nf;
        let mut r: Vec<DD> = self.f[..nf].iter().map(|&v| DD::new(-v)).collect();
        for j in 0..self.k.n {
            for p in self.k.col_ptr[j]..self.k.col_ptr[j + 1] {
                let i = self.k.row_idx[p];
                let v = self.k.values[p];
                if i < nf {
                    r[i] = r[i].add(x[j].mulf(v));
                }
                if i != j && j < nf {
                    r[j] = r[j].add(x[i].mulf(v));
                }
            }
        }
        for t in &self.terms {
            let n = self.axial(t, x);
            let g = Self::gx(t, x);
            for (a, &d) in t.dofs.iter().enumerate() {
                if d < nf {
                    r[d] = r[d].add(n.mul(g[a]));
                }
            }
        }
        r
    }

    /// Dense f64 Jacobian J(x) on the free DOFs.
    fn jacobian(&self, x: &[DD]) -> Vec<f64> {
        let nf = self.nf;
        let mut j = vec![0.0; nf * nf];
        for c in 0..self.k.n {
            for p in self.k.col_ptr[c]..self.k.col_ptr[c + 1] {
                let i = self.k.row_idx[p];
                if i < nf && c < nf {
                    j[i * nf + c] += self.k.values[p];
                    if i != c {
                        j[c * nf + i] += self.k.values[p];
                    }
                }
            }
        }
        for t in &self.terms {
            let nd = t.dofs.len();
            let n = self.axial(t, x).hi;
            let g = Self::gx(t, x);
            let c = t.e * t.a / t.l;
            for (a, &da) in t.dofs.iter().enumerate() {
                if da >= nf {
                    continue;
                }
                for (b, &db) in t.dofs.iter().enumerate() {
                    if db < nf {
                        j[da * nf + db] += n * t.g[a * nd + b];
                    }
                }
                for &(db, tc) in &t.elongation {
                    if db < nf {
                        j[da * nf + db] += c * g[a].hi * tc;
                    }
                }
            }
        }
        j
    }

    /// Newton with double-double residuals from the start `u0` (full vector).
    fn reference(&self, u0: &[f64]) -> Vec<DD> {
        let nf = self.nf;
        let mut x: Vec<DD> = u0.iter().map(|&v| DD::new(v)).collect();
        for _ in 0..30 {
            let r = self.residual(&x);
            let mut jm = self.jacobian(&x);
            let piv = lu_factor(&mut jm, nf).expect("reference Jacobian singular");
            let rhs: Vec<f64> = r.iter().map(|v| v.hi).collect();
            let dx = lu_apply(&jm, &piv, &rhs, nf).unwrap();
            for i in 0..nf {
                x[i] = x[i].sub(DD::new(dx[i]));
            }
            let s: f64 = dx.iter().map(|v| v * v).sum::<f64>().sqrt();
            let xs: f64 = x[..nf].iter().map(|v| v.hi * v.hi).sum::<f64>().sqrt();
            if s <= 1e-30 * xs.max(1e-300) {
                break;
            }
        }
        x
    }
}

fn dd_error(x: &[DD], u: &[f64], nf: usize) -> f64 {
    (0..nf).map(|i| x[i].sub(DD::new(u[i])).hi.powi(2)).sum::<f64>().sqrt()
}

fn gather_2d(dof: &DofNumbering, disp: &[Displacement]) -> Vec<f64> {
    let by: HashMap<usize, &Displacement> = disp.iter().map(|d| (d.node_id, d)).collect();
    let mut u = vec![0.0; dof.n_total];
    for (&(node, local), &g) in &dof.map {
        let d = by[&node];
        u[g] = [d.ux, d.uz, d.ry][local];
    }
    u
}

fn gather_3d(dof: &DofNumbering, disp: &[Displacement3D]) -> Vec<f64> {
    let by: HashMap<usize, &Displacement3D> = disp.iter().map(|d| (d.node_id, d)).collect();
    let mut u = vec![0.0; dof.n_total];
    for (&(node, local), &g) in &dof.map {
        let d = by[&node];
        u[g] = [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz, d.warping.unwrap_or(0.0)][local];
    }
    u
}

fn assert_pd_honest(name: &str, cert: &PDeltaCertificate, model: &PdModel, u: &[f64]) -> (f64, f64) {
    let PDeltaCertificate::Certified { abs_bound, .. } = cert else { panic!("{name}: {cert:?}") };
    let x = model.reference(u);
    let err = dd_error(&x, u, model.nf);
    assert!(err <= *abs_bound, "{name}: true error {err:e} exceeds bound {abs_bound:e}");
    (err, *abs_bound)
}

fn grid_frame(bays: usize, stories: usize, gravity: f64) -> SolverInput {
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
        .map(|(c, s)| SolverLoad::Nodal(SolverNodalLoad { node_id: id(c, s), fx: 5.0, fz: gravity, my: 0.0 }))
        .collect();
    make_input(nodes, vec![(1, 30_000.0, 0.2)], vec![(1, 0.16, 2.1e-3), (2, 0.12, 1.6e-3)], elems, sups, loads)
}

/// Portal with a pinned diagonal brace (truss) and a heated beam.
fn braced_portal() -> SolverInput {
    let mut input = make_portal_frame(4.0, 6.0, 200_000.0, 0.01, 1e-4, 30.0, -600.0);
    input.elements.insert(
        "4".into(),
        SolverElement {
            id: 4,
            elem_type: "truss".into(),
            node_i: 1,
            node_j: 3,
            material_id: 1,
            section_id: 1,
            hinge_start: false,
            hinge_end: false,
        },
    );
    input.loads.push(SolverLoad::Thermal(SolverThermalLoad { element_id: 2, dt_uniform: 30.0, dt_gradient: 0.0 }));
    input
}

fn building_3d(bays: usize, storeys: usize, gravity: f64) -> SolverInput3D {
    let (span, h) = (6.0, 3.5);
    let id = |i: usize, j: usize, k: usize| 1 + k * (bays + 1) * (bays + 1) + j * (bays + 1) + i;
    let mut nodes = vec![];
    for k in 0..=storeys {
        for j in 0..=bays {
            for i in 0..=bays {
                nodes.push((id(i, j, k), span * i as f64, span * j as f64, h * k as f64));
            }
        }
    }
    let mut elems = vec![];
    let mut member = |a: usize, b: usize, s: usize| {
        let e = elems.len() + 1;
        elems.push((e, "frame", a, b, 1, s));
    };
    for k in 0..storeys {
        for j in 0..=bays {
            for i in 0..=bays {
                member(id(i, j, k), id(i, j, k + 1), 1);
            }
        }
    }
    for k in 1..=storeys {
        for j in 0..=bays {
            for i in 0..=bays {
                if i < bays {
                    member(id(i, j, k), id(i + 1, j, k), 2);
                }
                if j < bays {
                    member(id(i, j, k), id(i, j + 1, k), 2);
                }
            }
        }
    }
    let sups = (0..=bays).flat_map(|j| (0..=bays).map(move |i| (id(i, j, 0), vec![true; 6]))).collect();
    let mut loads = vec![];
    for k in 1..=storeys {
        for j in 0..=bays {
            for i in 0..=bays {
                let fx = if i == 0 { 15.0 } else { 0.0 };
                loads.push(SolverLoad3D::Nodal(SolverNodalLoad3D {
                    node_id: id(i, j, k),
                    fx,
                    fy: 4.0,
                    fz: gravity,
                    mx: 0.0,
                    my: 0.0,
                    mz: 0.0,
                    bw: None,
                }));
            }
        }
    }
    make_3d_input(
        nodes,
        vec![(1, 200_000.0, 0.3)],
        vec![(1, 0.012, 1.5e-4, 1.5e-4, 2.0e-6), (2, 0.008, 2.5e-4, 1.0e-5, 1.0e-6)],
        elems,
        sups,
        vec![],
    )
    .with_loads(loads)
}

trait WithLoads {
    fn with_loads(self, loads: Vec<SolverLoad3D>) -> Self;
}

impl WithLoads for SolverInput3D {
    fn with_loads(mut self, loads: Vec<SolverLoad3D>) -> Self {
        self.loads = loads;
        self
    }
}

#[test]
fn certify_pdelta_2d_models() {
    let models = vec![
        ("portal", make_portal_frame(4.0, 6.0, 200_000.0, 0.01, 1e-4, 10.0, -800.0)),
        ("braced portal + thermal", braced_portal()),
        ("grid 3x6 (sparse path)", grid_frame(3, 6, -900.0)),
    ];
    for (name, input) in models {
        let out = certify_pdelta_2d(&input, 50, 1e-10).unwrap();
        assert!(out.results.converged, "{name}");
        let (model, dof) = pd_model_2d(&input);
        let u = gather_2d(&dof, &out.results.results.displacements);
        let (err, bound) = assert_pd_honest(name, &out.certificate, &model, &u);
        let PDeltaCertificate::Certified { rel_bound, stability_margin, mu, beta, .. } = &out.certificate else {
            unreachable!()
        };
        eprintln!(
            "{name}: n_f={} err={err:.2e} bound={bound:.2e} rel={rel_bound:.2e} μ={mu:.2e} β={beta:.2e} B2={:.3}",
            model.nf, out.results.b2_factor
        );
        assert!(*rel_bound < 1e-6, "{name}: bound unexpectedly loose {rel_bound:e}");
        assert!(stability_margin.is_some(), "{name}: stability not certified");
    }
}

#[test]
fn certify_pdelta_3d_building() {
    let input = building_3d(2, 3, -300.0);
    let out = certify_pdelta_3d(&input, 50, 1e-10).unwrap();
    assert!(out.results.converged);
    let (model, dof) = pd_model_3d(&input);
    let u = gather_3d(&dof, &out.results.results.displacements);
    let (err, bound) = assert_pd_honest("building", &out.certificate, &model, &u);
    eprintln!("3D building n_f={}: err={err:.2e} bound={bound:.2e} B2={:.3}", model.nf, out.results.b2_factor);
    let PDeltaCertificate::Certified { rel_bound, stability_margin, .. } = out.certificate else { unreachable!() };
    assert!(rel_bound < 1e-6 && stability_margin.is_some(), "{rel_bound:e}");
}

/// Critical gravity load per column of the test portal (linear buckling).
fn portal_pcr() -> f64 {
    let input = make_portal_frame(4.0, 6.0, 200_000.0, 0.01, 1e-4, 0.0, -1000.0);
    1000.0 * solve_buckling_2d(&input, 1).unwrap().modes[0].load_factor
}

/// An iteration-limited answer is still certified, with a bound on its
/// distance to the true fixed point that covers the true error.
#[test]
fn certify_pdelta_unconverged_and_perturbed() {
    let input = make_portal_frame(4.0, 6.0, 200_000.0, 0.01, 1e-4, 10.0, -0.8 * portal_pcr());
    let (model, dof) = pd_model_2d(&input);
    let few = solve_pdelta_2d(&input, 2, 1e-12).unwrap();
    let u = gather_2d(&dof, &few.results.displacements);
    let cert = certify_pdelta_results_2d(&input, &few.results);
    let (err, bound) = assert_pd_honest("2 iterations", &cert, &model, &u);
    assert!(err > 1e-9, "2 iterations should not have converged: {err:e}");
    eprintln!("unconverged: err={err:.2e} bound={bound:.2e}");

    // Perturb a converged answer: the bound must grow to cover it (small
    // perturbation), or the certificate is refused (one beyond the reach
    // μ/(2β) of the quadratic bound).
    let full = solve_pdelta_2d(&input, 50, 1e-12).unwrap();
    for (delta, must_certify) in [(1e-7, true), (1e-3, false)] {
        let mut res = full.results.clone();
        for d in res.displacements.iter_mut().filter(|d| d.node_id == 2) {
            d.ux += delta;
        }
        let u = gather_2d(&dof, &res.displacements);
        let cert = certify_pdelta_results_2d(&input, &res);
        if must_certify || cert.is_certified() {
            let (err, bound) = assert_pd_honest("perturbed", &cert, &model, &u);
            assert!(err > 0.9 * delta && bound >= delta, "{err:e} {bound:e}");
        }
    }
}

/// Past the critical load the solver's LU answer is an unstable equilibrium:
/// stability is never certified, and the linear answer is not certified as
/// the P-Delta one.
#[test]
fn certify_pdelta_refusals() {
    let input = make_portal_frame(4.0, 6.0, 200_000.0, 0.01, 1e-4, 10.0, -1.5 * portal_pcr());
    let out = certify_pdelta_2d(&input, 50, 1e-10).unwrap();
    if let PDeltaCertificate::Certified { stability_margin, .. } = &out.certificate {
        assert!(stability_margin.is_none(), "unstable state certified stable: {:?}", out.certificate);
    }
    // The linear solution offered as the second-order one (moderate load).
    let input = make_portal_frame(4.0, 6.0, 200_000.0, 0.01, 1e-4, 10.0, -1500.0);
    let (model, dof) = pd_model_2d(&input);
    let out = certify_pdelta_2d(&input, 50, 1e-12).unwrap();
    let lin = &out.results.linear_results;
    let u = gather_2d(&dof, &lin.displacements);
    let cert = certify_pdelta_results_2d(&input, lin);
    if cert.is_certified() {
        assert_pd_honest("linear as P-Delta", &cert, &model, &u);
    }
    // Missing node in the displacements.
    let mut res = out.results.results.clone();
    res.displacements.pop();
    assert!(!certify_pdelta_results_2d(&input, &res).is_certified());
    // Constraints are refused (not silently ignored).
    let mut c = input.clone();
    c.constraints.push(Constraint::EqualDOF(EqualDOFConstraint { master_node: 2, slave_node: 3, dofs: vec![0] }));
    assert!(!certify_pdelta_results_2d(&c, &out.results.results).is_certified());
}

// ───────────────────────── response spectrum ─────────────────────────

use dedaliano_engine::certify::spectral::{
    certify_spectral_2d, certify_spectral_3d, certify_spectral_results_2d, Enclosure, SpectralCertificate,
};
use dedaliano_engine::solver::assembly::assemble_stiffness_sparse_3d;
use dedaliano_engine::solver::mass_matrix::{assemble_mass_matrix_2d_sparse, assemble_mass_matrix_3d_sparse};
use dedaliano_engine::solver::modal::{solve_modal_2d, solve_modal_3d};
use dedaliano_engine::solver::spectral::solve_spectral_2d;

fn dense_lower(a: &CscMatrix) -> Vec<f64> {
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

/// Independent reference eigenpairs of K φ = λ M φ: dense Cholesky K = LLᵀ,
/// cyclic Jacobi on C = L⁻¹ M L⁻ᵀ, φ = L⁻ᵀ y. Returns (λ, φ) ascending in λ
/// for the finite eigenvalues, φ M-normalized.
fn reference_modes(k: &CscMatrix, m: &CscMatrix) -> Vec<(f64, Vec<f64>)> {
    let n = k.n;
    let mut l = dense_lower(k);
    for j in 0..n {
        let mut s = l[j * n + j];
        for q in 0..j {
            s -= l[j * n + q] * l[j * n + q];
        }
        let d = s.sqrt();
        l[j * n + j] = d;
        for i in j + 1..n {
            let mut s = l[i * n + j];
            for q in 0..j {
                s -= l[i * n + q] * l[j * n + q];
            }
            l[i * n + j] = s / d;
        }
        for q in j + 1..n {
            l[j * n + q] = 0.0;
        }
    }
    let md = dense_lower(m);
    // X = L⁻¹ M (forward solves on columns), then C = X L⁻ᵀ = (L⁻¹ Xᵀ)ᵀ.
    let fwd = |b: &[f64]| -> Vec<f64> {
        let mut x = b.to_vec();
        for i in 0..n {
            for q in 0..i {
                x[i] -= l[i * n + q] * x[q];
            }
            x[i] /= l[i * n + i];
        }
        x
    };
    let mut x = vec![0.0; n * n];
    for c in 0..n {
        let col: Vec<f64> = (0..n).map(|r| md[r * n + c]).collect();
        let y = fwd(&col);
        for r in 0..n {
            x[r * n + c] = y[r];
        }
    }
    let mut c = vec![0.0; n * n];
    for r in 0..n {
        let row: Vec<f64> = (0..n).map(|q| x[r * n + q]).collect();
        let y = fwd(&row);
        for q in 0..n {
            c[q * n + r] = y[q];
        }
    }
    for i in 0..n {
        for j in 0..i {
            let a = 0.5 * (c[i * n + j] + c[j * n + i]);
            c[i * n + j] = a;
            c[j * n + i] = a;
        }
    }
    let mut v = vec![0.0; n * n];
    for i in 0..n {
        v[i * n + i] = 1.0;
    }
    for _sweep in 0..100 {
        let off: f64 = (0..n).flat_map(|i| (0..n).filter(move |&j| j != i).map(move |j| (i, j))).map(|(i, j)| c[i * n + j].powi(2)).sum();
        let diag: f64 = (0..n).map(|i| c[i * n + i].powi(2)).sum();
        if off <= 1e-34 * diag {
            break;
        }
        for p in 0..n {
            for q in p + 1..n {
                let apq = c[p * n + q];
                if apq == 0.0 {
                    continue;
                }
                let theta = (c[q * n + q] - c[p * n + p]) / (2.0 * apq);
                let t = theta.signum() / (theta.abs() + (theta * theta + 1.0).sqrt());
                let t = if theta == 0.0 { 1.0 } else { t };
                let cs = 1.0 / (t * t + 1.0).sqrt();
                let sn = t * cs;
                for kk in 0..n {
                    let (akp, akq) = (c[kk * n + p], c[kk * n + q]);
                    c[kk * n + p] = cs * akp - sn * akq;
                    c[kk * n + q] = sn * akp + cs * akq;
                }
                for kk in 0..n {
                    let (apk, aqk) = (c[p * n + kk], c[q * n + kk]);
                    c[p * n + kk] = cs * apk - sn * aqk;
                    c[q * n + kk] = sn * apk + cs * aqk;
                }
                for kk in 0..n {
                    let (vkp, vkq) = (v[kk * n + p], v[kk * n + q]);
                    v[kk * n + p] = cs * vkp - sn * vkq;
                    v[kk * n + q] = sn * vkp + cs * vkq;
                }
            }
        }
    }
    let mut out: Vec<(f64, Vec<f64>)> = (0..n)
        .filter(|&i| c[i * n + i] > 1e-14 * (0..n).map(|j| c[j * n + j]).fold(0.0, f64::max))
        .map(|i| {
            let y: Vec<f64> = (0..n).map(|r| v[r * n + i]).collect();
            // φ = L⁻ᵀ y
            let mut phi = y.clone();
            for r in (0..n).rev() {
                for q in r + 1..n {
                    phi[r] -= l[q * n + r] * phi[q];
                }
                phi[r] /= l[r * n + r];
            }
            let mphi: Vec<f64> = (0..n).map(|r| (0..n).map(|q| md[r * n + q] * phi[q]).sum()).collect();
            let s = phi.iter().zip(&mphi).map(|(a, b)| a * b).sum::<f64>().sqrt();
            (1.0 / c[i * n + i], phi.iter().map(|x| x / s).collect())
        })
        .collect();
    out.sort_by(|a, b| a.0.total_cmp(&b.0));
    out
}

fn interp(points: &[SpectrumPoint], t: f64) -> f64 {
    if t <= points[0].period {
        return points[0].sa;
    }
    let last = points.last().unwrap();
    if t >= last.period {
        return last.sa;
    }
    let i = points.windows(2).position(|w| t >= w[0].period && t <= w[1].period).unwrap();
    let (a, b) = (&points[i], &points[i + 1]);
    a.sa + (t - a.period) / (b.period - a.period) * (b.sa - a.sa)
}

/// Reference combined displacement (free DOFs) and base shear from the exact
/// lowest `nm` modes.
fn reference_spectral(
    k: &CscMatrix,
    m: &CscMatrix,
    r: &[f64],
    nm: usize,
    spectrum: &DesignSpectrum,
    scale: f64,
    cqc_xi: Option<f64>,
) -> (Vec<f64>, f64) {
    let modes = reference_modes(k, m);
    let n = k.n;
    let md = dense_lower(m);
    let mr: Vec<f64> = (0..n).map(|i| (0..n).map(|q| md[i * n + q] * r[q]).sum()).collect();
    let mut per = vec![];
    let mut shear = 0.0;
    let mut omegas = vec![];
    for (lam, phi) in modes.iter().take(nm) {
        let gamma: f64 = phi.iter().zip(&mr).map(|(a, b)| a * b).sum(); // φᵀMφ = 1
        let w = lam.sqrt();
        let sa = interp(&spectrum.points, 2.0 * std::f64::consts::PI / w) * scale;
        per.push(phi.iter().map(|p| p * gamma * sa / lam).collect::<Vec<f64>>());
        shear += (gamma * gamma * sa).powi(2);
        omegas.push(w);
    }
    let comb = (0..n)
        .map(|kk| {
            let mut s = 0.0;
            for i in 0..nm {
                for j in 0..nm {
                    let rho = match cqc_xi {
                        None => (i == j) as u8 as f64,
                        Some(xi) => {
                            let rr = omegas[j] / omegas[i];
                            let num = 8.0 * xi * xi * (1.0 + rr) * rr.powf(1.5);
                            let den = (1.0 - rr * rr).powi(2) + 4.0 * xi * xi * rr * (1.0 + rr).powi(2);
                            num / den
                        }
                    };
                    s += per[i][kk] * rho * per[j][kk];
                }
            }
            s.abs().sqrt()
        })
        .collect();
    (comb, shear.sqrt())
}

fn design_spectrum() -> DesignSpectrum {
    let points = [(0.0, 0.4), (0.15, 1.0), (0.5, 1.0), (1.0, 0.5), (3.0, 0.17)]
        .iter()
        .map(|&(period, sa)| SpectrumPoint { period, sa })
        .collect();
    DesignSpectrum { name: "test".into(), points, in_g: Some(true) }
}

fn densities() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), 2500.0);
    d
}

fn spectral_input_2d(input: &SolverInput, nm: usize, rule: &str) -> SpectralInput {
    let modal = solve_modal_2d(input, &densities(), nm).unwrap();
    let modes = modal
        .modes
        .iter()
        .map(|md| SpectralModeInput {
            frequency: md.frequency,
            period: md.period,
            omega: md.omega,
            displacements: md
                .displacements
                .iter()
                .map(|d| SpectralModeDisp { node_id: d.node_id, ux: d.ux, uz: d.uz, ry: d.ry })
                .collect(),
            participation_x: md.participation_x,
            participation_y: md.participation_y,
            effective_mass_x: md.effective_mass_x,
            effective_mass_y: md.effective_mass_y,
        })
        .collect();
    SpectralInput {
        solver: input.clone(),
        modes,
        densities: densities(),
        spectrum: design_spectrum(),
        direction: "X".into(),
        rule: Some(rule.into()),
        xi: Some(0.05),
        importance_factor: Some(1.2),
        reduction_factor: Some(3.0),
        total_mass: Some(modal.total_mass),
    }
}

/// `x` lies in `e`, up to the reference's own accuracy `slack`.
fn within(e: &Enclosure, x: f64, slack: f64) -> bool {
    e.lo - slack <= x && x <= e.hi + slack
}

#[test]
fn certify_spectral_2d_honest() {
    let input = grid_frame(2, 4, -20.0);
    for rule in ["SRSS", "CQC"] {
        let sp = spectral_input_2d(&input, 4, rule);
        let out = certify_spectral_2d(&sp).unwrap();
        let SpectralCertificate::Certified {
            modes, displacements, base_shear, max_displacement_error, base_shear_error, reported_within, ..
        } = &out.certificate
        else {
            panic!("{rule}: {:?}", out.certificate)
        };
        let dof = DofNumbering::build_2d(&input);
        let k = assemble_stiffness_sparse_2d(&input, &dof).k_ff;
        let m = assemble_mass_matrix_2d_sparse(&input, &dof, &densities());
        let mut r = vec![0.0; dof.n_free];
        for (&(_, local), &g) in &dof.map {
            if local == 0 && g < dof.n_free {
                r[g] = 1.0;
            }
        }
        let scale = 9.81 * 1.2 / 3.0;
        let xi = (rule == "CQC").then_some(0.05);
        let (ref_u, ref_shear) = reference_spectral(&k, &m, &r, 4, &sp.spectrum, scale, xi);
        let umax = ref_u.iter().fold(0.0f64, |a, &b| a.max(b));
        let slack = 1e-14 * umax;
        let mut width = 0.0f64;
        for ne in displacements {
            for (local, e) in ne.values.iter().enumerate() {
                let x = dof.map.get(&(ne.id, local)).filter(|&&g| g < dof.n_free).map_or(0.0, |&g| ref_u[g]);
                assert!(within(e, x, slack), "{rule}: node {} dof {local}: ref {x:e} outside {e:?}", ne.id);
                width = width.max(e.hi - e.lo);
            }
        }
        assert!(within(base_shear, ref_shear, 1e-14 * ref_shear), "{rule}: shear {ref_shear} {base_shear:?}");
        for mb in modes {
            assert!(mb.sin_theta < 1e-4, "{rule}: {mb:?}");
        }
        eprintln!(
            "spectral {rule}: max width {width:.2e} (max |u| {umax:.2e}), disp err ≤ {max_displacement_error:.2e}, \
             shear {:.4} ∈ [{:.6}, {:.6}] err ≤ {base_shear_error:.2e}, reported within: {reported_within}",
            ref_shear, base_shear.lo, base_shear.hi
        );
        assert!(width < 1e-5 * umax, "{rule}: enclosure too wide {width:e}");
        assert!(*max_displacement_error < 1e-4 * umax);
    }
}

#[test]
fn certify_spectral_refusals() {
    let input = grid_frame(2, 4, -20.0);
    let sp = spectral_input_2d(&input, 4, "CQC");
    // A missing mode: the remaining set is not the lowest modes.
    let mut missing = sp.clone();
    missing.modes.remove(1);
    let res = solve_spectral_2d(&missing).unwrap();
    assert!(!certify_spectral_results_2d(&missing, &res).is_certified(), "missing mode certified");
    // A wrong frequency: either refused, or the reported (wrong) answer is
    // flagged as outside the enclosure of the exact response.
    let mut wrong = sp.clone();
    wrong.modes[0].omega *= 1.2;
    wrong.modes[0].period /= 1.2;
    let res = solve_spectral_2d(&wrong).unwrap();
    if let SpectralCertificate::Certified { reported_within, .. } = certify_spectral_results_2d(&wrong, &res) {
        assert!(!reported_within, "wrong ω reported as within the enclosure");
    }
    // A tampered participation factor: the reported values leave the enclosure.
    let mut tampered = sp.clone();
    tampered.modes[0].participation_x *= 1.05;
    let res = solve_spectral_2d(&tampered).unwrap();
    let SpectralCertificate::Certified { reported_within, max_displacement_error, .. } =
        certify_spectral_results_2d(&tampered, &res)
    else {
        panic!("tampered participation should still be certifiable (it is not used)")
    };
    assert!(!reported_within && max_displacement_error > 0.0);
    // Reported result tampered after the fact.
    let mut res = solve_spectral_2d(&sp).unwrap();
    res.base_shear *= 1.01;
    let SpectralCertificate::Certified { reported_within, .. } = certify_spectral_results_2d(&sp, &res) else {
        panic!()
    };
    assert!(!reported_within);
    // Unsorted spectrum refused.
    let mut bad = sp.clone();
    bad.spectrum.points.swap(1, 2);
    let res = solve_spectral_2d(&bad).unwrap();
    assert!(!certify_spectral_results_2d(&bad, &res).is_certified());
}

#[test]
fn certify_spectral_3d_building() {
    let mut input = building_3d(1, 3, -50.0);
    // Break the plan symmetry so no frequency is repeated.
    for s in input.sections.values_mut() {
        if s.id == 1 {
            s.iz = 3.0e-4;
        }
    }
    let modal = solve_modal_3d(&input, &densities(), 4).unwrap();
    let modes = modal
        .modes
        .iter()
        .map(|md| SpectralModeInput3D {
            frequency: md.frequency,
            period: md.period,
            omega: md.omega,
            displacements: md
                .displacements
                .iter()
                .map(|d| SpectralModeDisp3D { node_id: d.node_id, ux: d.ux, uy: d.uy, uz: d.uz, rx: d.rx, ry: d.ry, rz: d.rz })
                .collect(),
            participation_x: md.participation_x,
            participation_y: md.participation_y,
            participation_z: md.participation_z,
            effective_mass_x: md.effective_mass_x,
            effective_mass_y: md.effective_mass_y,
            effective_mass_z: md.effective_mass_z,
        })
        .collect();
    let sp = SpectralInput3D {
        solver: input.clone(),
        modes,
        densities: densities(),
        spectrum: design_spectrum(),
        direction: "X".into(),
        rule: Some("CQC".into()),
        xi: Some(0.05),
        importance_factor: None,
        reduction_factor: None,
        total_mass: Some(modal.total_mass),
    };
    let out = certify_spectral_3d(&sp).unwrap();
    let SpectralCertificate::Certified { displacements, base_shear, max_displacement_error, .. } = &out.certificate
    else {
        panic!("{:?}", out.certificate)
    };
    let dof = DofNumbering::build_3d(&input);
    let k = assemble_stiffness_sparse_3d(&input, &dof, false).k_ff;
    let m = assemble_mass_matrix_3d_sparse(&input, &dof, &densities());
    let mut r = vec![0.0; dof.n_free];
    for (&(_, local), &g) in &dof.map {
        if local == 0 && g < dof.n_free {
            r[g] = 1.0;
        }
    }
    let (ref_u, ref_shear) = reference_spectral(&k, &m, &r, 4, &sp.spectrum, 9.81, Some(0.05));
    let umax = ref_u.iter().fold(0.0f64, |a, &b| a.max(b));
    for ne in displacements {
        for (local, e) in ne.values.iter().enumerate() {
            let x = dof.map.get(&(ne.id, local)).filter(|&&g| g < dof.n_free).map_or(0.0, |&g| ref_u[g]);
            assert!(within(e, x, 1e-14 * umax), "node {} dof {local}: ref {x:e} outside {e:?}", ne.id);
        }
    }
    assert!(within(base_shear, ref_shear, 1e-14 * ref_shear));
    eprintln!("spectral 3D: disp err ≤ {max_displacement_error:.2e} (max |u| {umax:.2e})");
}

// ───────────────────────── harmonic response ─────────────────────────

use dedaliano_engine::certify::harmonic::{certify_harmonic_2d, certify_point, HarmonicCertificate};
use dedaliano_engine::solver::harmonic::HarmonicInput;

/// Reference steady state of (K − ω²M + iω(a₀M + a₁K))u = f: LU of the real
/// 2n×2n block matrix in f64, iterative refinement with double-double residuals.
fn reference_harmonic(k: &CscMatrix, m: &CscMatrix, f: &[f64], a: (f64, f64), w: f64) -> (Vec<DD>, Vec<DD>) {
    let n = k.n;
    let (kd, md) = (dense_lower(k), dense_lower(m));
    let n2 = 2 * n;
    let mut big = vec![0.0; n2 * n2];
    for i in 0..n {
        for j in 0..n {
            let kdij = kd[i * n + j] - w * w * md[i * n + j];
            let wc = w * (a.0 * md[i * n + j] + a.1 * kd[i * n + j]);
            big[i * n2 + j] = kdij;
            big[i * n2 + n + j] = -wc;
            big[(n + i) * n2 + j] = wc;
            big[(n + i) * n2 + n + j] = kdij;
        }
    }
    let piv = lu_factor(&mut big, n2).expect("reference block matrix singular");
    let (w2, ww) = {
        let (p, e) = two_prod(w, w);
        (DD { hi: p, lo: e }, DD::new(w))
    };
    let mut xr = vec![DD::default(); n];
    let mut xi = vec![DD::default(); n];
    let matvec = |a: &[f64], x: &[DD]| -> Vec<DD> {
        (0..n).map(|i| (0..n).fold(DD::default(), |s, j| s.add(x[j].mulf(a[i * n + j])))).collect()
    };
    for _ in 0..6 {
        let (kr, ki, mr, mi) = (matvec(&kd, &xr), matvec(&kd, &xi), matvec(&md, &xr), matvec(&md, &xi));
        let mut rhs = vec![0.0; n2];
        for j in 0..n {
            let kdr = kr[j].sub(w2.mul(mr[j]));
            let kdi = ki[j].sub(w2.mul(mi[j]));
            let cr = mr[j].mulf(a.0).add(kr[j].mulf(a.1));
            let ci = mi[j].mulf(a.0).add(ki[j].mulf(a.1));
            rhs[j] = DD::new(f[j]).sub(kdr.sub(ww.mul(ci))).hi;
            rhs[n + j] = kdi.add(ww.mul(cr)).neg().hi;
        }
        let d = lu_apply(&big, &piv, &rhs, n2).unwrap();
        for j in 0..n {
            xr[j] = xr[j].add(DD::new(d[j]));
            xi[j] = xi[j].add(DD::new(d[n + j]));
        }
    }
    (xr, xi)
}

fn harmonic_model_2d(input: &SolverInput) -> (CscMatrix, CscMatrix, Vec<f64>, DofNumbering) {
    let dof = DofNumbering::build_2d(input);
    let k = assemble_stiffness_sparse_2d(input, &dof).k_ff;
    let m = assemble_mass_matrix_2d_sparse(input, &dof, &densities());
    let f = assemble_load_vector_2d(input, &input.loads, &dof, &[])[..dof.n_free].to_vec();
    (k, m, f, dof)
}

#[test]
fn certify_harmonic_point_honest() {
    let input = grid_frame(1, 3, -20.0);
    let (k, m, f, _) = harmonic_model_2d(&input);
    let modal = solve_modal_2d(&input, &densities(), 3).unwrap();
    let w1 = modal.modes[0].omega;
    let a = (0.05 * w1, 0.002);
    for (label, w) in [("static", 0.0), ("0.5ω1", 0.5 * w1), ("0.99ω1", 0.99 * w1), ("ω1", w1), ("1.5ω1", 1.5 * w1)]
    {
        let pc = certify_point(&k, &m, &f, a, w, 0.0).unwrap_or_else(|e| panic!("{label}: {e}"));
        let (xr, xi) = reference_harmonic(&k, &m, &f, a, w);
        let err = (0..k.n)
            .map(|j| xr[j].sub(DD::new(pc.u_re[j])).hi.powi(2) + xi[j].sub(DD::new(pc.u_im[j])).hi.powi(2))
            .sum::<f64>()
            .sqrt();
        let unorm = pc.u_re.iter().chain(&pc.u_im).map(|x| x * x).sum::<f64>().sqrt();
        eprintln!(
            "harmonic {label}: s={} μ={:.2e} err={err:.2e} bound={:.2e} (‖u‖={unorm:.2e})",
            pc.shift, pc.mu, pc.abs_bound
        );
        assert!(err <= pc.abs_bound, "{label}: err {err:e} > bound {:e}", pc.abs_bound);
        assert!(pc.abs_bound < 1e-8 * unorm, "{label}: loose bound");
    }
}

#[test]
fn certify_harmonic_sweep_2d() {
    let input = grid_frame(1, 3, -20.0);
    let modal = solve_modal_2d(&input, &densities(), 3).unwrap();
    let f1 = modal.modes[0].frequency;
    let hi = HarmonicInput {
        solver: input.clone(),
        densities: densities(),
        frequencies: vec![0.0, 0.5 * f1, 0.95 * f1, f1, 1.2 * f1, 2.0 * f1, 5.0 * f1],
        damping_ratio: 0.05,
        response_node_id: 8,
        response_dof: "x".into(),
    };
    let out = certify_harmonic_2d(&hi).unwrap();
    let HarmonicCertificate::Certified { a0, a1, points, peak_amplitude, max_reported_error, reported_within } =
        &out.certificate
    else {
        panic!("{:?}", out.certificate)
    };
    let (k, m, f, dof) = harmonic_model_2d(&input);
    let t = dof.map[&(8, 0)];
    for pt in points {
        let (xr, xi) = reference_harmonic(&k, &m, &f, (*a0, *a1), pt.omega);
        let (re, im) = (xr[t].hi, xi[t].hi);
        assert!(pt.real.contains(re) && pt.imag.contains(im), "f={}: ({re}, {im}) {pt:?}", pt.frequency);
        assert!(pt.amplitude.contains((re * re + im * im).sqrt()));
    }
    eprintln!(
        "sweep: peak ∈ [{:.6e}, {:.6e}] reported {:.6e}, max reported error {max_reported_error:.2e}, within {reported_within}",
        peak_amplitude.lo, peak_amplitude.hi, out.results.peak_amplitude
    );
    // A tampered result is caught.
    let mut res = out.results.clone();
    res.response_points[3].real *= 1.001;
    let c = dedaliano_engine::certify::harmonic::certify_harmonic_results_2d(&hi, &res, (*a0, *a1));
    let HarmonicCertificate::Certified { reported_within, .. } = c else { panic!() };
    assert!(!reported_within);
    // A wrong damping model: the solver's answer is outside the enclosures.
    let c = dedaliano_engine::certify::harmonic::certify_harmonic_results_2d(&hi, &out.results, (2.0 * a0, 2.0 * a1));
    if let HarmonicCertificate::Certified { reported_within, .. } = c {
        assert!(!reported_within, "answer for another damping model reported as within");
    }
}

/// The solver's modal superposition with static correction against the exact
/// steady state (2n×2n LU with double-double refinement), on the dense (18
/// DOF) and sparse (72 DOF) paths, from below the first resonance to well
/// above it. Plain superposition of the kept modes was off by up to 7e-5 of
/// the peak on the 18-DOF frame (reported peak 6.258509e-2 vs exact
/// 6.258518e-2); the static correction of the omitted modes brings it to
/// ~1e-7.
#[test]
fn harmonic_static_correction_matches_exact() {
    use dedaliano_engine::solver::harmonic::solve_harmonic_2d_with_damping;
    for (bays, stories, tol) in [(1, 3, 1e-6), (3, 6, 1e-6)] {
        let input = grid_frame(bays, stories, -20.0);
        let modal = solve_modal_2d(&input, &densities(), 3).unwrap();
        let f1 = modal.modes[0].frequency;
        let top = (stories + 1) * (bays + 1);
        let hi = HarmonicInput {
            solver: input.clone(),
            densities: densities(),
            frequencies: vec![0.0, 0.5 * f1, 0.95 * f1, f1, 1.2 * f1, 2.0 * f1, 5.0 * f1],
            damping_ratio: 0.05,
            response_node_id: top,
            response_dof: "x".into(),
        };
        let (res, (a0, a1)) = solve_harmonic_2d_with_damping(&hi).unwrap();
        let (k, m, f, dof) = harmonic_model_2d(&input);
        assert_eq!(res.method, "modal+static", "{bays}x{stories}: {res:?}");
        assert_eq!(res.n_dof, k.n);
        assert!(res.modes_used > 0 && res.modes_used <= k.n);
        let ratio = res.truncation_ratio.expect("truncation ratio");
        assert!((0.0..1.0).contains(&ratio), "{bays}x{stories}: ratio {ratio}");
        assert!(res.warnings.is_empty(), "{bays}x{stories}: {:?}", res.warnings);
        let t = dof.map[&(top, 0)];
        let mut worst = 0.0f64;
        for pt in &res.response_points {
            let (xr, xi) = reference_harmonic(&k, &m, &f, (a0, a1), pt.omega);
            let err = ((pt.real - xr[t].hi).powi(2) + (pt.imag - xi[t].hi).powi(2)).sqrt();
            worst = worst.max(err / res.peak_amplitude);
        }
        eprintln!(
            "{bays}x{stories}: {} of {} modes, static truncation ratio {ratio:.2e}, max error / peak {worst:.2e}",
            res.modes_used, res.n_dof
        );
        assert!(worst < tol, "{bays}x{stories}: max error / peak {worst:e} ≥ {tol:e}");
    }
}

/// Far above the modes the eigensolve returned (18-DOF frame, half its modes),
/// the static-correction series does not converge: those frequencies get plain
/// superposition and the result says so.
#[test]
fn harmonic_truncation_is_reported() {
    use dedaliano_engine::solver::harmonic::solve_harmonic_2d;
    let input = grid_frame(1, 3, -20.0);
    let modal = solve_modal_2d(&input, &densities(), 3).unwrap();
    let f1 = modal.modes[0].frequency;
    let hi = HarmonicInput {
        solver: input,
        densities: densities(),
        frequencies: vec![0.5 * f1, f1, 200.0 * f1],
        damping_ratio: 0.05,
        response_node_id: 8,
        response_dof: "x".into(),
    };
    let res = solve_harmonic_2d(&hi).unwrap();
    assert_eq!(res.method, "modal+static");
    assert!(res.modes_used < res.n_dof, "{res:?}");
    assert_eq!(res.warnings.len(), 1, "{:?}", res.warnings);
    assert!(res.warnings[0].contains("static correction not applied at 1 frequency"), "{:?}", res.warnings);
    assert!(res.response_points.iter().all(|p| p.amplitude.is_finite()));
}
