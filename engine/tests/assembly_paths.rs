//! Cross-path assembly oracle.
//!
//! The engine builds the same matrices along several independent code paths:
//! dense 2D/3D assembly, the sparse linear-static assembly used at or above
//! `SPARSE_THRESHOLD`, the `_ex` sparse assembler of 2D buckling and time
//! integration, the legacy triplet assemblers, the parallel 3D assembler, the
//! constrained reductions, the dense and sparse mass matrices, three
//! geometric-stiffness builders (from displacements, from element forces, and
//! the affine terms of the P-Delta certificate), the reduced systems the
//! certificates check and the buckling system. They are supposed to agree.
//!
//! For random models reaching every branch (tests/fuzz_models), every path
//! is compared entry-wise against the dense one, with a tolerance of 1e-12
//! times the larger max-norm of the two matrices (or vectors). DOF maps,
//! artificial-stiffness DOFs and inclined-support transforms are compared
//! exactly. A 2D model is also embedded in the XZ plane of a 3D model with
//! the out-of-plane DOFs restrained, so the 2D and 3D element routines check
//! each other.
//!
//! A failing check is shrunk to a minimal model, which is printed as JSON.
//! Checks that fail only because of a known, separately tracked bug are
//! tallied, not asserted; each has a minimal `#[ignore = "KNOWN: ..."]`
//! reproduction below. New findings have their own minimal tests. See
//! docs/verification/ASSEMBLY.md.

mod fuzz_models;

use dedaliano_engine::certify::solver::reduced_sparse_2d;
use dedaliano_engine::certify::solver::reduced_sparse_3d;
use dedaliano_engine::linalg::sparse::CscMatrix;
use dedaliano_engine::solver::assembly::*;
use dedaliano_engine::solver::buckling::{buckling_system_2d, buckling_system_3d};
use dedaliano_engine::solver::constraints::FreeConstraintSystem;
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::geometric_stiffness::*;
use dedaliano_engine::solver::linear::{solve_2d, solve_3d};
use dedaliano_engine::solver::mass_matrix::*;
use dedaliano_engine::solver::sparse_assembly::{
    assemble_2d_sparse, assemble_elements_parallel_2d, assemble_load_vector_sparse_3d,
    assemble_stiffness_sparse_2d, assemble_stiffness_sparse_3d_parallel,
};
use dedaliano_engine::types::*;
use fuzz_models::{add_random_constraints_2d, add_random_constraints_3d, random_2d_model_rich, random_3d_model_rich};
use std::collections::{BTreeMap, HashMap};

/// Entry-wise tolerance, relative to the larger max-norm of the two operands.
const TOL: f64 = 1e-12;

// ─── comparison primitives ──────────────────────────────────────────────────

fn max_abs(x: &[f64]) -> f64 {
    x.iter().fold(0.0f64, |m, v| m.max(v.abs()))
}

/// The worst entry of `a − b` (both `rows × cols`, row-major), if it exceeds
/// `tol` times the larger max-norm.
fn mismatch(a: &[f64], b: &[f64], cols: usize, tol: f64) -> Option<String> {
    if a.len() != b.len() {
        return Some(format!("size {} vs {}", a.len(), b.len()));
    }
    let scale = max_abs(a).max(max_abs(b));
    let (mut worst, mut at) = (0.0f64, 0);
    for k in 0..a.len() {
        let d = (a[k] - b[k]).abs();
        if !(d <= worst) {
            worst = d;
            at = k;
        }
    }
    if worst > tol * scale || worst.is_nan() {
        let c = cols.max(1);
        Some(format!("({}, {}): {:e} vs {:e}, |Δ|/‖·‖ = {:e}", at / c, at % c, a[at], b[at], worst / scale))
    } else {
        None
    }
}

/// Full symmetric dense matrix of a lower-triangle CSC.
fn dense(m: &CscMatrix) -> Vec<f64> {
    m.to_dense_symmetric()
}

/// The `idx × idx` principal block of an `n × n` dense matrix.
fn block(k: &[f64], n: usize, idx: &[usize]) -> Vec<f64> {
    let mut out = Vec::with_capacity(idx.len() * idx.len());
    for &i in idx {
        for &j in idx {
            out.push(k[i * n + j]);
        }
    }
    out
}


/// `T K Tᵀ`, T the identity with the rotation `r` (rows = new axes) on `dofs`.
fn rotate_dense(k: &mut [f64], n: usize, dofs: &[usize], r: &[Vec<f64>]) {
    let m = dofs.len();
    for c in 0..n {
        let col: Vec<f64> = dofs.iter().map(|&d| k[d * n + c]).collect();
        for a in 0..m {
            k[dofs[a] * n + c] = (0..m).map(|b| r[a][b] * col[b]).sum();
        }
    }
    for row in 0..n {
        let v: Vec<f64> = dofs.iter().map(|&d| k[row * n + d]).collect();
        for a in 0..m {
            k[row * n + dofs[a]] = (0..m).map(|b| r[a][b] * v[b]).sum();
        }
    }
}

fn rotate_all_2d(k: &mut [f64], n: usize, its: &[InclinedTransformData2D]) {
    for it in its {
        rotate_dense(k, n, &it.dofs, &it.r.iter().map(|r| r.to_vec()).collect::<Vec<_>>());
    }
}

fn rotate_all_3d(k: &mut [f64], n: usize, its: &[InclinedTransformData]) {
    for it in its {
        rotate_dense(k, n, &it.dofs, &it.r.iter().map(|r| r.to_vec()).collect::<Vec<_>>());
    }
}

/// Zero the diagonal at `dofs` (artificial stiffness, compared separately).
fn mask_diag(k: &mut [f64], n: usize, dofs: &[usize]) {
    for &d in dofs {
        if d < n {
            k[d * n + d] = 0.0;
        }
    }
}

/// Failed checks of one model, by tag.
#[derive(Default)]
struct Checks {
    fails: BTreeMap<&'static str, String>,
    /// Every check that ran, failed or not (coverage of the sweep).
    ran: std::collections::BTreeSet<&'static str>,
}

impl Checks {
    fn fail(&mut self, tag: &'static str, detail: String) {
        self.ran.insert(tag);
        self.fails.entry(tag).or_insert(detail);
    }
    fn mat(&mut self, tag: &'static str, a: &[f64], b: &[f64], n: usize) {
        self.ran.insert(tag);
        if let Some(m) = mismatch(a, b, n, TOL) {
            self.fail(tag, m);
        }
    }
    fn vec(&mut self, tag: &'static str, a: &[f64], b: &[f64]) {
        self.ran.insert(tag);
        if let Some(m) = mismatch(a, b, 1, TOL) {
            self.fail(tag, m);
        }
    }
    /// A dense matrix equals its transpose (the sparse paths keep one triangle).
    fn symmetric(&mut self, tag: &'static str, k: &[f64], n: usize) {
        let t: Vec<f64> = (0..n * n).map(|p| k[(p % n) * n + p / n]).collect();
        self.mat(tag, k, &t, n);
    }
    fn eq<T: PartialEq + std::fmt::Debug>(&mut self, tag: &'static str, a: T, b: T) {
        self.ran.insert(tag);
        if a != b {
            self.fail(tag, format!("{a:?} vs {b:?}"));
        }
    }
}

fn sorted(mut v: Vec<usize>) -> Vec<usize> {
    v.sort();
    v.dedup();
    v
}

/// The DOF map is a bijection onto 0..n_total, free DOFs first, and
/// rebuilding it gives the same map (HashMap order must not leak in).
fn check_dof_map(c: &mut Checks, tag: &'static str, a: &DofNumbering, b: &DofNumbering) {
    let mut seen = vec![false; a.n_total];
    for &d in a.map.values() {
        if d >= a.n_total || seen[d] {
            c.fail(tag, format!("index {d} repeated or out of range"));
            return;
        }
        seen[d] = true;
    }
    if a.map.len() != a.n_total || a.n_free > a.n_total {
        c.fail(tag, format!("{} entries for n_total {}", a.map.len(), a.n_total));
    }
    let mut ka: Vec<_> = a.map.iter().collect();
    let mut kb: Vec<_> = b.map.iter().collect();
    ka.sort();
    kb.sort();
    c.eq(tag, (ka, a.n_free), (kb, b.n_free));
}

// ─── 2D ─────────────────────────────────────────────────────────────────────

/// The model with the triggers of the known `assemble_sparse_2d_ex` bug (a)
/// removed: no spring angles, no inclined rollers, no springs on non-spring
/// supports. (Orphan rotations are masked through the artificial DOFs.)
fn without_ex_triggers_2d(input: &SolverInput) -> SolverInput {
    let mut s = input.clone();
    for sup in s.supports.values_mut() {
        sup.angle = None;
        if sup.support_type == "inclinedRoller" {
            sup.support_type = "rollerX".into();
        }
        if sup.support_type != "spring" {
            sup.kx = None;
            sup.ky = None;
            sup.kz = None;
        }
    }
    s
}

fn u_random(n: usize, seed: u64) -> Vec<f64> {
    // Small LCG: independent of the model generator's stream.
    let mut x = seed.wrapping_mul(0x9E3779B97F4A7C15) | 1;
    (0..n)
        .map(|_| {
            x = x.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            ((x >> 11) as f64 / (1u64 << 53) as f64 - 0.5) * 2e-3
        })
        .collect()
}

/// Σ N_e(u)·G_e from the affine terms, as a dense n×n matrix.
fn kg_from_terms(terms: &[KgAffineTerm], u: &[f64], n: usize) -> (Vec<f64>, HashMap<usize, f64>) {
    let mut k = vec![0.0; n * n];
    let mut axial = HashMap::new();
    for t in terms {
        let delta: f64 = t.elongation.iter().map(|&(d, c)| c * u[d]).sum();
        let nf = t.e * t.a * (delta / t.l - t.alpha * t.dt);
        axial.insert(t.element_id, nf);
        let m = t.dofs.len();
        for i in 0..m {
            for j in 0..m {
                k[t.dofs[i] * n + t.dofs[j]] += nf * t.g[i * m + j];
            }
        }
    }
    (k, axial)
}

fn forces_2d(axial: &HashMap<usize, f64>) -> Vec<ElementForces> {
    let mut v: Vec<ElementForces> = axial
        .iter()
        .map(|(&id, &n)| ElementForces {
            element_id: id, n_start: n, n_end: n, v_start: 0.0, v_end: 0.0, m_start: 0.0, m_end: 0.0,
            length: 0.0, q_i: 0.0, q_j: 0.0, point_loads: vec![], distributed_loads: vec![],
            hinge_start: false, hinge_end: false,
        })
        .collect();
    v.sort_by_key(|f| f.element_id);
    v
}

fn forces_3d(axial: &HashMap<usize, f64>) -> Vec<ElementForces3D> {
    let mut v: Vec<ElementForces3D> = axial
        .iter()
        .map(|(&id, &n)| ElementForces3D {
            element_id: id, length: 0.0, n_start: n, n_end: n, vy_start: 0.0, vy_end: 0.0, vz_start: 0.0,
            vz_end: 0.0, mx_start: 0.0, mx_end: 0.0, my_start: 0.0, my_end: 0.0, mz_start: 0.0, mz_end: 0.0,
            release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
            release_t_start: false, release_t_end: false, q_yi: 0.0, q_yj: 0.0, distributed_loads_y: vec![],
            point_loads_y: vec![], q_zi: 0.0, q_zj: 0.0, distributed_loads_z: vec![], distributed_loads_x: vec![],
            point_loads_z: vec![], bimoment_start: None, bimoment_end: None,
        })
        .collect();
    v.sort_by_key(|f| f.element_id);
    v
}

/// Full displacement vector (DOF numbering order) of 2D results.
fn u_of_2d(dn: &DofNumbering, res: &AnalysisResults) -> Vec<f64> {
    let mut u = vec![0.0; dn.n_total];
    for d in &res.displacements {
        for (k, v) in [d.ux, d.uz, d.ry].into_iter().enumerate() {
            if let Some(&i) = dn.map.get(&(d.node_id, k)) {
                u[i] = v;
            }
        }
    }
    u
}

fn u_of_3d(dn: &DofNumbering, res: &AnalysisResults3D) -> Vec<f64> {
    let mut u = vec![0.0; dn.n_total];
    for d in &res.displacements {
        let w = d.warping.unwrap_or(0.0);
        for (k, v) in [d.ux, d.uy, d.uz, d.rx, d.ry, d.rz, w].into_iter().enumerate() {
            if let Some(&i) = dn.map.get(&(d.node_id, k)) {
                u[i] = v;
            }
        }
    }
    u
}

/// `f_F − K_FR u_R` from the full dense K.
fn reduced_rhs(k: &[f64], n: usize, nf: usize, f: &[f64], u: &[f64]) -> Vec<f64> {
    (0..nf).map(|i| f[i] - (nf..n).map(|j| k[i * n + j] * u[j]).sum::<f64>()).collect()
}

fn check_2d(input: &SolverInput, densities: &HashMap<String, f64>, seed: u64) -> Checks {
    let mut c = Checks::default();
    let dn = DofNumbering::build_2d(input);
    check_dof_map(&mut c, "2d.dof_map", &dn, &DofNumbering::build_2d(input));
    let (n, nf) = (dn.n_total, dn.n_free);
    let free: Vec<usize> = (0..nf).collect();

    // Dense reference.
    let st = assemble_stiffness_2d(input, &dn);
    let k = &st.k;
    c.symmetric("2d.dense.symmetric", k, n);
    let f = assemble_load_vector_2d(input, &input.loads, &dn, &st.inclined_transforms_2d);
    c.vec("2d.assemble_2d.f", &assemble_2d(input, &dn).f, &f);

    // Sparse linear-static path.
    let sp = assemble_stiffness_sparse_2d(input, &dn);
    c.mat("2d.sparse.k_full", &dense(&sp.k_full), k, n);
    c.mat("2d.sparse.k_ff", &dense(&sp.k_ff), &block(k, n, &free), nf);
    c.eq("2d.sparse.artificial_dofs", sorted(sp.artificial_dofs.clone()), sorted(st.artificial_dofs.clone()));
    c.vec("2d.sparse.max_diag", &[sp.max_diag_k], &[st.max_diag_k]);
    let its = |v: &[InclinedTransformData2D]| v.iter().map(|t| (t.node_id, t.dofs, t.r)).collect::<Vec<_>>();
    c.eq("2d.sparse.inclined", its(&sp.inclined_transforms_2d), its(&st.inclined_transforms_2d));

    // `_ex` (2D buckling, time integration). The raw comparison is the known
    // bug (a); on the model without its triggers, with the artificial
    // diagonal compared on its own, anything left is new.
    let ex_raw = assemble_sparse_2d_ex(input, &dn, true);
    c.mat("2d.ex.k_full.raw", &dense(ex_raw.k_full.as_ref().unwrap()), k, n);
    {
        let san = without_ex_triggers_2d(input);
        let dns = DofNumbering::build_2d(&san);
        let (ns, nfs) = (dns.n_total, dns.n_free);
        let sts = assemble_stiffness_2d(&san, &dns);
        let fs = assemble_load_vector_2d(&san, &san.loads, &dns, &sts.inclined_transforms_2d);
        let ex = assemble_sparse_2d_ex(&san, &dns, true);
        let art = sorted(sts.artificial_dofs.iter().chain(&ex.artificial_dofs).copied().collect());
        let (mut kd, mut ke) = (sts.k.clone(), dense(ex.k_full.as_ref().unwrap()));
        mask_diag(&mut kd, ns, &art);
        mask_diag(&mut ke, ns, &art);
        c.mat("2d.ex.k_full", &ke, &kd, ns);
        let frees: Vec<usize> = (0..nfs).collect();
        let mut kff = dense(&ex.k_ff);
        mask_diag(&mut kff, nfs, &art);
        c.mat("2d.ex.k_ff", &kff, &block(&kd, ns, &frees), nfs);
        c.vec("2d.ex.f", &ex.f, &fs);
        // Artificial stiffness: a different set is the missing orphan guard
        // (known); the same set with different values is the scale.
        let (sd, se) = (sorted(sts.artificial_dofs.clone()), sorted(ex.artificial_dofs.clone()));
        if se.iter().all(|d| sd.contains(d)) {
            let diag = |kk: &[f64], d: usize| kk[d * ns + d];
            let kef = dense(ex.k_full.as_ref().unwrap());
            for &d in &se {
                c.ran.insert("2d.ex.artificial_scale");
                if (diag(&kef, d) - diag(&sts.k, d)).abs() > TOL * sts.max_diag_k {
                    c.fail("2d.ex.artificial_scale", format!("dof {d}: {:e} vs {:e}", diag(&kef, d), diag(&sts.k, d)));
                }
            }
        }

        // Legacy triplet assemblers (benches only) on the same model.
        for (tag_k, tag_f, legacy) in [
            ("2d.legacy.k_ff", "2d.legacy.f", assemble_2d_sparse(&san, &dns)),
            ("2d.legacy_parallel.k_ff", "2d.legacy_parallel.f", assemble_elements_parallel_2d(&san, &dns)),
        ] {
            let mut kl = dense(&legacy.triplets.to_csc());
            mask_diag(&mut kl, nfs, &art);
            c.mat(tag_k, &kl, &block(&kd, ns, &frees), nfs);
            c.vec(tag_f, &legacy.f, &fs);
        }
    }

    // Mass: dense vs sparse, and whether ignoring the inclined rotation (the
    // dynamic solvers never apply it to M) is harmless.
    let m = assemble_mass_matrix_2d(input, &dn, densities);
    c.mat("2d.mass.sparse", &dense(&assemble_mass_matrix_2d_sparse(input, &dn, densities)), &block(&m, n, &free), nf);
    if !st.inclined_transforms_2d.is_empty() {
        let mut mr = m.clone();
        rotate_all_2d(&mut mr, n, &st.inclined_transforms_2d);
        c.mat("2d.mass.inclined_frame", &block(&m, n, &free), &block(&mr, n, &free), nf);
    }

    // Geometric stiffness at a random displacement: from u (P-Delta), from
    // the affine terms (P-Delta certificate), from element forces (buckling).
    let u = u_random(n, seed);
    let mut kg = vec![0.0; n * n];
    add_geometric_stiffness_2d(input, &dn, &u, &mut kg);
    c.symmetric("2d.kg.symmetric", &kg, n);
    let (kg_terms, axial) = kg_from_terms(&geometric_stiffness_terms_2d(input, &dn), &u, n);
    c.mat("2d.kg.terms", &kg_terms, &kg, n);
    let kg_forces = build_kg_from_forces_2d(input, &dn, &forces_2d(&axial), &[]).into_csc();
    c.mat("2d.kg.forces", &dense(&kg_forces), &block(&kg, n, &free), nf);

    // Constrained reductions, dense vs sparse.
    let mut ci = input.clone();
    add_random_constraints_2d(&mut ci, seed);
    if let Ok(Some(cs)) = FreeConstraintSystem::build_2d(&ci, &dn) {
        let p = cs.n_free_indep;
        c.mat("2d.constrained.k", &dense(&cs.reduce_matrix_sparse(&sp.k_ff)), &cs.reduce_matrix(&block(k, n, &free)), p);
        let msp = assemble_mass_matrix_2d_sparse(input, &dn, densities);
        c.mat("2d.constrained.m", &dense(&cs.reduce_matrix_sparse(&msp)), &cs.reduce_matrix(&block(&m, n, &free)), p);
        c.mat("2d.constrained.kg", &dense(&cs.reduce_matrix_sparse(&kg_forces)), &cs.reduce_matrix(&block(&kg, n, &free)), p);
    }

    // Through a linear solve: the certificate's reduced system and the
    // buckling system.
    if let Ok(res) = solve_2d(input) {
        let uu = u_of_2d(&dn, &res);
        if let Ok((kc, fc, _)) = reduced_sparse_2d(input, &res) {
            c.mat("2d.certify.k_ff", &dense(&kc), &block(k, n, &free), nf);
            let mid: Vec<f64> = fc.iter().map(|iv| 0.5 * (iv.lo + iv.hi)).collect();
            c.vec("2d.certify.rhs", &mid, &reduced_rhs(k, n, nf, &f, &uu));
        }
    }
    if let Ok(sys) = buckling_system_2d(input) {
        let stb = assemble_stiffness_2d(input, &sys.dof_num);
        let mut kref = stb.k.clone();
        let art = sorted(stb.artificial_dofs.iter().chain(&ex_artificial(input, &sys.dof_num)).copied().collect());
        mask_diag(&mut kref, n, &art);
        let mut kb = dense(&sys.k_ff);
        mask_diag(&mut kb, nf, &art);
        c.mat("2d.buckling.k_ff", &kb, &block(&kref, n, &free), nf);
        // −K_G must be in the frame of K: rotated at inclined supports. The
        // reference is K_G at the linear solution's displacements (each
        // member's N from its elongation, as buckling builds it since the
        // OpenSees differential fix), over all DOFs, rotated.
        let uu = u_of_2d(&sys.dof_num, &sys.linear);
        let mut kgl = vec![0.0; n * n];
        add_geometric_stiffness_2d(input, &sys.dof_num, &uu, &mut kgl);
        rotate_all_2d(&mut kgl, n, &stb.inclined_transforms_2d);
        let neg: Vec<f64> = block(&kgl, n, &free).iter().map(|v| -v).collect();
        c.mat("2d.buckling.kg", &dense(&sys.neg_kg_csc), &neg, nf);
    }

    // The 2D model in the XZ plane of a 3D one.
    check_embedding(&mut c, input, densities, seed);
    c
}

/// The same numbering with every DOF counted as free, so the free-block
/// builders return the whole matrix.
fn all_free(dn: &DofNumbering) -> DofNumbering {
    DofNumbering {
        map: dn.map.clone(), n_free: dn.n_total, n_total: dn.n_total,
        dofs_per_node: dn.dofs_per_node, node_order: dn.node_order.clone(),
    }
}

fn ex_artificial(input: &SolverInput, dn: &DofNumbering) -> Vec<usize> {
    assemble_sparse_2d_ex(input, dn, false).artificial_dofs
}

// ─── 2D in 3D ───────────────────────────────────────────────────────────────

/// The 2D model's features that have a 3D equivalent: no connectors (their
/// 2D and 3D formulations are bug (b)'s), no rotated springs or inclined
/// rollers (a 3D inclined support cannot also restrain the out-of-plane
/// translation), no springs on restrained DOFs (a 3D spring frees its DOF),
/// no point loads' axial part or moment (no 3D counterpart).
fn planar_subset(input: &SolverInput) -> SolverInput {
    let mut s = without_ex_triggers_2d(input);
    s.connectors.clear();
    for l in s.loads.iter_mut() {
        if let SolverLoad::PointOnElement(p) = l {
            p.px = None;
            p.my = None;
        }
    }
    s
}

/// 2D local DOF (ux, uz, ry) → 3D local DOF (ux, uz, ry); the rotation
/// changes sign (`ROT_SIGN`).
const MAP_2D_3D: [usize; 3] = [0, 2, 4];

fn embed(input: &SolverInput, rot_sign: f64) -> SolverInput3D {
    let nodes = input.nodes.values().map(|n| (n.id.to_string(), SolverNode3D { id: n.id, x: n.x, y: 0.0, z: n.z })).collect();
    let sections = input
        .sections
        .values()
        .map(|s| {
            (s.id.to_string(), SolverSection3D {
                id: s.id, name: None, a: s.a, iy: s.iz, iz: s.iz, j: s.iz, cw: None, as_y: s.as_y, as_z: s.as_y,
            })
        })
        .collect();
    let elements = input
        .elements
        .values()
        .map(|e| {
            (e.id.to_string(), SolverElement3D {
                id: e.id, elem_type: e.elem_type.clone(), node_i: e.node_i, node_j: e.node_j,
                material_id: e.material_id, section_id: e.section_id,
                release_my_start: e.hinge_start, release_my_end: e.hinge_end,
                release_mz_start: e.hinge_start, release_mz_end: e.hinge_end,
                release_t_start: false, release_t_end: false,
                local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
            })
        })
        .collect();
    let by_node: HashMap<usize, &SolverSupport> = input.supports.values().map(|s| (s.node_id, s)).collect();
    let mut supports = HashMap::new();
    for nd in input.nodes.values() {
        let mut s = SolverSupport3D {
            node_id: nd.id, rx: false, ry: true, rz: false, rrx: true, rry: false, rrz: true,
            kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
            dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
            normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
        };
        if let Some(sup) = by_node.get(&nd.id) {
            let (x, z, r) = match sup.support_type.as_str() {
                "fixed" => (true, true, true),
                "pinned" => (true, true, false),
                "rollerX" => (false, true, false),
                "rollerY" | "rollerZ" => (true, false, false),
                "guidedX" => (false, true, true),
                "guidedY" | "guidedZ" => (true, false, true),
                _ => (false, false, false),
            };
            s.rx = x;
            s.rz = z;
            s.rry = r;
            if sup.support_type == "spring" {
                s.kx = sup.kx;
                s.kz = sup.ky;
                s.kry = sup.kz;
            }
            s.dx = sup.dx;
            s.dz = sup.dz;
            s.dry = sup.dry.map(|v| rot_sign * v);
        }
        supports.insert(nd.id.to_string(), s);
    }
    let node_xz: HashMap<usize, (f64, f64)> = input.nodes.values().map(|n| (n.id, (n.x, n.z))).collect();
    // The 2D transverse direction (−sin, cos) in 3D, on each element's local y and z.
    let transverse = |eid: usize| -> (f64, f64) {
        let e = input.elements.values().find(|e| e.id == eid).unwrap();
        let (a, b) = (node_xz[&e.node_i], node_xz[&e.node_j]);
        let l = ((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)).sqrt();
        let (cos, sin) = ((b.0 - a.0) / l, (b.1 - a.1) / l);
        let (_ex, ey, ez) = dedaliano_engine::element::compute_local_axes_3d(a.0, 0.0, a.1, b.0, 0.0, b.1, None, None, None, None, false);
        let t = [-sin, 0.0, cos];
        (ey[0] * t[0] + ey[2] * t[2], ez[0] * t[0] + ez[2] * t[2])
    };
    let loads = input
        .loads
        .iter()
        .map(|l| match l {
            SolverLoad::Nodal(nl) => SolverLoad3D::Nodal(SolverNodalLoad3D {
                node_id: nl.node_id, fx: nl.fx, fy: 0.0, fz: nl.fz, mx: 0.0, my: rot_sign * nl.my, mz: 0.0, bw: None,
            }),
            SolverLoad::Distributed(dl) => {
                let (cy, cz) = transverse(dl.element_id);
                SolverLoad3D::Distributed(SolverDistributedLoad3D {
                    element_id: dl.element_id, q_xi: 0.0, q_xj: 0.0,
                    q_yi: cy * dl.q_i, q_yj: cy * dl.q_j, q_zi: cz * dl.q_i, q_zj: cz * dl.q_j, a: dl.a, b: dl.b,
                })
            }
            SolverLoad::PointOnElement(pl) => {
                let (cy, cz) = transverse(pl.element_id);
                SolverLoad3D::PointOnElement(SolverPointLoad3D { element_id: pl.element_id, a: pl.a, py: cy * pl.p, pz: cz * pl.p })
            }
            SolverLoad::Thermal(tl) => {
                let (cy, cz) = transverse(tl.element_id);
                // Opposite conventions: the 2D gradient is the −y face minus
                // the +y face ("bottom minus top"), the 3D one the +z (+y) face
                // minus the other (the web flips it the same way).
                SolverLoad3D::Thermal(SolverThermalLoad3D {
                    element_id: tl.element_id, dt_uniform: tl.dt_uniform,
                    dt_gradient_y: -cy * tl.dt_gradient, dt_gradient_z: -cz * tl.dt_gradient,
                })
            }
        })
        .collect();
    SolverInput3D {
        solver_options: None, nodes, materials: input.materials.clone(), sections, elements, supports, loads,
        constraints: vec![], left_hand: None, plates: HashMap::new(), quads: HashMap::new(), quad9s: HashMap::new(),
        solid_shells: HashMap::new(), curved_shells: HashMap::new(), curved_beams: vec![], connectors: HashMap::new(),
    }
}

/// Sign relating the 2D rotation to the 3D rotation about +y. The 2D frame
/// rotation is θ = dv/ds with v along (−sin, cos); a rotation φ about +y
/// moves a point s·(cos, 0, sin) by φ·ŷ×r = −s·φ·(−sin, 0, cos), so θ = −φ.
const ROT_SIGN: f64 = -1.0;

fn check_embedding(c: &mut Checks, input: &SolverInput, densities: &HashMap<String, f64>, seed: u64) {
    let p = planar_subset(input);
    let q = embed(&p, ROT_SIGN);
    let (d2, d3) = (DofNumbering::build_2d(&p), DofNumbering::build_3d(&q));
    let (n2, n3) = (d2.n_total, d3.n_total);
    // 2D index → (3D index, sign).
    let mut to3 = vec![(0usize, 1.0f64); n2];
    for (&(node, ld), &i) in &d2.map {
        let i3 = d3.map[&(node, MAP_2D_3D[ld])];
        to3[i] = (i3, if ld == 2 { ROT_SIGN } else { 1.0 });
        if (i < d2.n_free) != (i3 < d3.n_free) {
            c.fail("2d3d.dof_map", format!("node {node} dof {ld}: free in one and not the other"));
        }
        c.ran.insert("2d3d.dof_map");
    }
    let pull = |k3: &[f64]| -> Vec<f64> {
        let mut k = vec![0.0; n2 * n2];
        for i in 0..n2 {
            for j in 0..n2 {
                let ((a, sa), (b, sb)) = (to3[i], to3[j]);
                k[i * n2 + j] = sa * sb * k3[a * n3 + b];
            }
        }
        k
    };
    let s2 = assemble_stiffness_2d(&p, &d2);
    let s3 = assemble_stiffness_3d(&q, &d3);
    // Both put artificial stiffness on the rotations nothing holds (a node
    // every member is hinged at), scaled by their own largest diagonal, which
    // differ: the same DOFs must get it, and the rest of K must agree.
    let art3: std::collections::BTreeSet<usize> = s3.artificial_dofs.iter().copied().collect();
    let art2: std::collections::BTreeSet<usize> = s2.artificial_dofs.iter().map(|&i| to3[i].0).collect();
    if art2 != art3 {
        c.fail("2d3d.artificial", format!("artificial DOFs: 2D {art2:?} vs 3D {art3:?}"));
    }
    c.ran.insert("2d3d.artificial");
    let mut k2 = s2.k.clone();
    mask_diag(&mut k2, n2, &s2.artificial_dofs);
    let mut k3 = s3.k.clone();
    mask_diag(&mut k3, n3, &s3.artificial_dofs);
    c.mat("2d3d.k", &pull(&k3), &k2, n2);
    let f3 = assemble_load_vector_3d_dense(&q, &q.loads, &d3, &[]);
    let f2 = assemble_load_vector_2d(&p, &p.loads, &d2, &[]);
    let f3p: Vec<f64> = (0..n2).map(|i| to3[i].1 * f3[to3[i].0]).collect();
    c.vec("2d3d.f", &f3p, &f2);
    c.mat("2d3d.m", &pull(&assemble_mass_matrix_3d(&q, &d3, densities)), &assemble_mass_matrix_2d(&p, &d2, densities), n2);
    let u2 = u_random(n2, seed);
    let mut u3 = vec![0.0; n3];
    for i in 0..n2 {
        u3[to3[i].0] = to3[i].1 * u2[i];
    }
    let (mut g2, mut g3) = (vec![0.0; n2 * n2], vec![0.0; n3 * n3]);
    add_geometric_stiffness_2d(&p, &d2, &u2, &mut g2);
    add_geometric_stiffness_3d(&q, &d3, &u3, &mut g3);
    c.mat("2d3d.kg", &pull(&g3), &g2, n2);
}

// ─── 3D ─────────────────────────────────────────────────────────────────────

fn check_3d(input: &SolverInput3D, densities: &HashMap<String, f64>, seed: u64) -> Checks {
    let mut c = Checks::default();
    let dn = DofNumbering::build_3d(input);
    check_dof_map(&mut c, "3d.dof_map", &dn, &DofNumbering::build_3d(input));
    let (n, nf) = (dn.n_total, dn.n_free);
    let free: Vec<usize> = (0..nf).collect();

    let st = assemble_stiffness_3d(input, &dn);
    let k = &st.k;
    c.symmetric("3d.dense.symmetric", k, n);
    let f = assemble_load_vector_3d_dense(input, &input.loads, &dn, &st.inclined_transforms);
    let its = |v: &[InclinedTransformData]| v.iter().map(|t| (t.node_id, t.dofs, t.r)).collect::<Vec<_>>();
    for (tag, sp, tags) in [
        ("serial", assemble_stiffness_sparse_3d(input, &dn, true), ["3d.sparse.k_full", "3d.sparse.k_ff", "3d.sparse.artificial_dofs", "3d.sparse.max_diag", "3d.sparse.inclined", "3d.sparse.f"]),
        ("parallel", assemble_stiffness_sparse_3d_parallel(input, &dn, true), ["3d.parallel.k_full", "3d.parallel.k_ff", "3d.parallel.artificial_dofs", "3d.parallel.max_diag", "3d.parallel.inclined", "3d.parallel.f"]),
    ] {
        c.mat(tags[0], &dense(sp.k_full.as_ref().unwrap()), k, n);
        c.mat(tags[1], &dense(&sp.k_ff), &block(k, n, &free), nf);
        c.eq(tags[2], sorted(sp.artificial_dofs.clone()), sorted(st.artificial_dofs.clone()));
        c.vec(tags[3], &[sp.max_diag_k], &[st.max_diag_k]);
        c.eq(tags[4], its(&sp.inclined_transforms), its(&st.inclined_transforms));
        let fs = if tag == "serial" {
            assemble_load_vector_3d_sparse(input, &input.loads, &dn, &sp.inclined_transforms)
        } else {
            assemble_load_vector_sparse_3d(input, &input.loads, &dn, &sp.inclined_transforms)
        };
        c.vec(tags[5], &fs, &f);
    }

    let m = assemble_mass_matrix_3d(input, &dn, densities);
    let msp = assemble_mass_matrix_3d_sparse(input, &dn, densities);
    c.mat("3d.mass.sparse", &dense(&msp), &block(&m, n, &free), nf);
    if !st.inclined_transforms.is_empty() {
        let mut mr = m.clone();
        rotate_all_3d(&mut mr, n, &st.inclined_transforms);
        c.mat("3d.mass.inclined_frame", &block(&m, n, &free), &block(&mr, n, &free), nf);
    }

    let u = u_random(n, seed);
    // `add_geometric_stiffness_3d` includes the shells' Kg (P-Delta uses it,
    // since the feature-matrix PR); the affine terms and the element-force
    // builder are frames/trusses only, so they are compared with the members'
    // part: the same model with its shells removed, on the same numbering.
    let mut kg_all = vec![0.0; n * n];
    add_geometric_stiffness_3d(input, &dn, &u, &mut kg_all);
    c.symmetric("3d.kg.symmetric", &kg_all, n);
    let mut members_only = input.clone();
    members_only.plates.clear();
    members_only.quads.clear();
    members_only.quad9s.clear();
    members_only.solid_shells.clear();
    members_only.curved_shells.clear();
    let mut kg = vec![0.0; n * n];
    add_geometric_stiffness_3d(&members_only, &dn, &u, &mut kg);
    let (kg_terms, axial) = kg_from_terms(&geometric_stiffness_terms_3d(input, &dn), &u, n);
    c.mat("3d.kg.terms", &kg_terms, &kg, n);
    let kg_forces = build_kg_from_forces_3d(input, &dn, &forces_3d(&axial)).into_csc();
    c.mat("3d.kg.forces", &dense(&kg_forces), &block(&kg, n, &free), nf);

    let mut ci = input.clone();
    add_random_constraints_3d(&mut ci, seed);
    if let Ok(Some(cs)) = FreeConstraintSystem::build_3d(&ci, &dn) {
        let p = cs.n_free_indep;
        let sp = assemble_stiffness_sparse_3d(input, &dn, false);
        c.mat("3d.constrained.k", &dense(&cs.reduce_matrix_sparse(&sp.k_ff)), &cs.reduce_matrix(&block(k, n, &free)), p);
        c.mat("3d.constrained.m", &dense(&cs.reduce_matrix_sparse(&msp)), &cs.reduce_matrix(&block(&m, n, &free)), p);
        c.mat("3d.constrained.kg", &dense(&cs.reduce_matrix_sparse(&kg_forces)), &cs.reduce_matrix(&block(&kg, n, &free)), p);
    }

    if let Ok(res) = solve_3d(input) {
        if let Ok((kc, fc, _)) = reduced_sparse_3d(input, &res) {
            c.mat("3d.certify.k_ff", &dense(&kc), &block(k, n, &free), nf);
            let mid: Vec<f64> = fc.iter().map(|iv| 0.5 * (iv.lo + iv.hi)).collect();
            c.vec("3d.certify.rhs", &mid, &reduced_rhs(k, n, nf, &f, &u_of_3d(&dn, &res)));
        }
    }
    if let Ok(sys) = buckling_system_3d(input) {
        c.mat("3d.buckling.k_ff", &dense(&sys.k_ff), &block(k, n, &free), nf);
        {
            // Members and shells alike (the reference includes the shells' Kg).
            // K_G at the linear solution's displacements (N from elongation,
            // as buckling builds it), over all DOFs, rotated like K.
            let uu = u_of_3d(&sys.dof_num, &sys.linear);
            let mut kgl = vec![0.0; n * n];
            add_geometric_stiffness_3d(input, &sys.dof_num, &uu, &mut kgl);
            rotate_all_3d(&mut kgl, n, &st.inclined_transforms);
            let neg: Vec<f64> = block(&kgl, n, &free).iter().map(|v| -v).collect();
            c.mat("3d.buckling.kg", &dense(&sys.neg_kg_csc), &neg, nf);
        }
    }
    c
}

// ─── shrinking ──────────────────────────────────────────────────────────────

/// Greedy one-at-a-time removal while `fails` still holds: loads,
/// connectors, supports, elements (with their loads), then unreferenced
/// nodes, then feature flags.
fn shrink_2d(mut m: SolverInput, fails: &dyn Fn(&SolverInput) -> bool) -> SolverInput {
    loop {
        let mut cands: Vec<SolverInput> = Vec::new();
        for i in 0..m.loads.len() {
            let mut t = m.clone();
            t.loads.remove(i);
            cands.push(t);
        }
        for key in m.connectors.keys() {
            let mut t = m.clone();
            t.connectors.remove(key);
            cands.push(t);
        }
        for key in m.supports.keys() {
            let mut t = m.clone();
            t.supports.remove(key);
            cands.push(t);
        }
        if m.elements.len() > 1 {
            for (key, e) in &m.elements {
                let mut t = m.clone();
                t.elements.remove(key);
                let id = e.id;
                t.loads.retain(|l| match l {
                    SolverLoad::Distributed(d) => d.element_id != id,
                    SolverLoad::PointOnElement(p) => p.element_id != id,
                    SolverLoad::Thermal(th) => th.element_id != id,
                    SolverLoad::Nodal(_) => true,
                });
                cands.push(t);
            }
        }
        for key in m.nodes.keys() {
            let id = m.nodes[key].id;
            let used = m.elements.values().any(|e| e.node_i == id || e.node_j == id)
                || m.supports.values().any(|s| s.node_id == id)
                || m.connectors.values().any(|c| c.node_i == id || c.node_j == id)
                || m.loads.iter().any(|l| matches!(l, SolverLoad::Nodal(n) if n.node_id == id));
            if !used {
                let mut t = m.clone();
                t.nodes.remove(key);
                cands.push(t);
            }
        }
        for key in m.elements.keys() {
            let e = &m.elements[key];
            if e.hinge_start || e.hinge_end {
                let mut t = m.clone();
                let te = t.elements.get_mut(key).unwrap();
                te.hinge_start = false;
                te.hinge_end = false;
                cands.push(t);
            }
        }
        for key in m.sections.keys() {
            if m.sections[key].as_y.is_some() {
                let mut t = m.clone();
                t.sections.get_mut(key).unwrap().as_y = None;
                cands.push(t);
            }
        }
        match cands.into_iter().find(|t| fails(t)) {
            Some(t) => m = t,
            None => return m,
        }
    }
}

fn shrink_3d(mut m: SolverInput3D, fails: &dyn Fn(&SolverInput3D) -> bool) -> SolverInput3D {
    loop {
        let mut cands: Vec<SolverInput3D> = Vec::new();
        for i in 0..m.loads.len() {
            let mut t = m.clone();
            t.loads.remove(i);
            cands.push(t);
        }
        macro_rules! drop_family {
            ($f:ident) => {
                if !m.$f.is_empty() {
                    let mut t = m.clone();
                    t.$f.clear();
                    cands.push(t);
                }
            };
        }
        drop_family!(connectors);
        drop_family!(plates);
        drop_family!(quads);
        drop_family!(quad9s);
        drop_family!(solid_shells);
        drop_family!(curved_shells);
        for key in m.supports.keys() {
            let mut t = m.clone();
            t.supports.remove(key);
            cands.push(t);
        }
        if m.elements.len() > 1 {
            for (key, e) in &m.elements {
                let mut t = m.clone();
                t.elements.remove(key);
                let id = e.id;
                t.loads.retain(|l| match l {
                    SolverLoad3D::Distributed(d) => d.element_id != id,
                    SolverLoad3D::PointOnElement(p) => p.element_id != id,
                    SolverLoad3D::Thermal(th) => th.element_id != id,
                    _ => true,
                });
                cands.push(t);
            }
        }
        for key in m.elements.keys() {
            let e = &m.elements[key];
            if e.release_my_start || e.release_my_end || e.release_mz_start || e.release_mz_end || e.release_t_start
                || e.local_yx.is_some() || e.roll_angle.is_some()
            {
                let mut t = m.clone();
                let te = t.elements.get_mut(key).unwrap();
                te.release_my_start = false;
                te.release_my_end = false;
                te.release_mz_start = false;
                te.release_mz_end = false;
                te.release_t_start = false;
                te.local_yx = None;
                te.local_yy = None;
                te.local_yz = None;
                te.roll_angle = None;
                cands.push(t);
            }
        }
        for key in m.nodes.keys() {
            let id = m.nodes[key].id;
            let used = m.elements.values().any(|e| e.node_i == id || e.node_j == id)
                || m.plates.values().any(|e| e.nodes.contains(&id))
                || m.quads.values().any(|e| e.nodes.contains(&id))
                || m.quad9s.values().any(|e| e.nodes.contains(&id))
                || m.solid_shells.values().any(|e| e.nodes.contains(&id))
                || m.curved_shells.values().any(|e| e.nodes.contains(&id))
                || m.supports.values().any(|s| s.node_id == id)
                || m.connectors.values().any(|c| c.node_i == id || c.node_j == id)
                || m.loads.iter().any(|l| matches!(l, SolverLoad3D::Nodal(n) if n.node_id == id)
                    || matches!(l, SolverLoad3D::Bimoment(b) if b.node_id == id));
            if !used {
                let mut t = m.clone();
                t.nodes.remove(key);
                cands.push(t);
            }
        }
        if m.left_hand.is_some() {
            let mut t = m.clone();
            t.left_hand = None;
            cands.push(t);
        }
        match cands.into_iter().find(|t| fails(t)) {
            Some(t) => m = t,
            None => return m,
        }
    }
}

// ─── sweeps ─────────────────────────────────────────────────────────────────

/// Checks failing only through a known, separately tracked bug: tallied,
/// not asserted. Each has a minimal ignored reproduction below.
const KNOWN: &[(&str, &str)] = &[
    ("2d.ex.k_full.raw", "KNOWN (a): assemble_sparse_2d_ex ignores spring angles and inclined rollers, lacks the orphan-rotation guard, omits springs on restrained DOFs in k_full"),
    ("2d.buckling.k_ff", "KNOWN (a): the 2D buckling K_ff comes from assemble_sparse_2d_ex"),
];

/// New findings this oracle made that are reported, not fixed here; each has
/// a minimal ignored reproduction below.
const REPORTED: &[(&str, &str)] = &[
    ("2d.ex.artificial_scale", "NEW, reported: assemble_sparse_2d_ex scales artificial stiffness by the largest FREE diagonal (dense: all DOFs); belongs with fix/sparse2d"),
    ("2d.buckling.kg", "NEW, reported: 2D buckling K_G is never rotated at inclined supports; latent until fix/sparse2d rotates its K"),
    ("2d.legacy.f", "NEW, reported: legacy assemble_2d_sparse (benches only) drops truss member and thermal loads"),
    ("2d.legacy.k_ff", "NEW, reported: legacy assemble_2d_sparse (benches only) drops connectors"),
    ("2d.legacy_parallel.f", "NEW, reported: legacy assemble_elements_parallel_2d (benches only) drops truss member and thermal loads"),
    ("2d.legacy_parallel.k_ff", "NEW, reported: legacy assemble_elements_parallel_2d (benches only) drops connectors"),
    ("2d.mass.inclined_frame", "NEW, reported: M is never rotated at inclined supports (modal, harmonic, time history, reduction use it with the rotated K)"),
    ("3d.mass.inclined_frame", "NEW, reported: M is never rotated at inclined supports (modal, harmonic, time history, reduction use it with the rotated K)"),
];

/// Connectors on nodes without exactly 3 (2D) or 6 (3D) DOFs are scattered
/// with a hardcoded stride: known bug (b), which panics or misplaces terms.
/// Those connectors are dropped before the comparisons.
fn strip_known_b_2d(m: &mut SolverInput) -> bool {
    let strip = !m.connectors.is_empty() && DofNumbering::build_2d(m).dofs_per_node != 3;
    if strip {
        m.connectors.clear();
    }
    strip
}

fn strip_known_b_3d(m: &mut SolverInput3D) -> bool {
    let strip = !m.connectors.is_empty() && DofNumbering::build_3d(m).dofs_per_node != 6;
    if strip {
        m.connectors.clear();
    }
    strip
}

/// The failed checks, or a panic as the failure `panic_tag`.
fn guarded(panic_tag: &'static str, f: impl FnOnce() -> Checks) -> Checks {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(f)) {
        Ok(c) => c,
        Err(e) => {
            let msg = e.downcast_ref::<String>().cloned()
                .or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string()))
                .unwrap_or_default();
            let mut c = Checks::default();
            c.fail(panic_tag, msg);
            c
        }
    }
}

fn model_2d(seed: u64) -> (SolverInput, HashMap<String, f64>, bool) {
    let (mut m, d) = random_2d_model_rich(seed);
    let stripped = strip_known_b_2d(&mut m);
    (m, d, stripped)
}

fn model_3d(seed: u64) -> (SolverInput3D, HashMap<String, f64>, bool) {
    let (mut m, d) = random_3d_model_rich(seed);
    let stripped = strip_known_b_3d(&mut m);
    (m, d, stripped)
}

fn run_sweep(n2d: u64, n3d: u64, base: u64) {
    let hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_| {}));
    let mut tally: BTreeMap<&'static str, (usize, u64)> = BTreeMap::new();
    let mut unexpected: BTreeMap<&'static str, (u64, String, bool)> = BTreeMap::new();
    let mut stripped = 0;
    let mut coverage: BTreeMap<&'static str, usize> = BTreeMap::new();
    let tolerated = |tag: &str| KNOWN.iter().chain(REPORTED).any(|(t, _)| *t == tag);
    for s in base..base + n2d {
        let (m, d, st) = model_2d(s);
        stripped += st as usize;
        let checks = guarded("2d.panic", || check_2d(&m, &d, s));
        for tag in &checks.ran {
            *coverage.entry(tag).or_insert(0) += 1;
        }
        for (tag, detail) in checks.fails {
            let e = tally.entry(tag).or_insert((0, s));
            e.0 += 1;
            if !tolerated(tag) {
                unexpected.entry(tag).or_insert((s, detail, true));
            }
        }
    }
    for s in base..base + n3d {
        let (m, d, st) = model_3d(s);
        stripped += st as usize;
        let checks = guarded("3d.panic", || check_3d(&m, &d, s));
        for tag in &checks.ran {
            *coverage.entry(tag).or_insert(0) += 1;
        }
        for (tag, detail) in checks.fails {
            let e = tally.entry(tag).or_insert((0, s));
            e.0 += 1;
            if !tolerated(tag) {
                unexpected.entry(tag).or_insert((s, detail, false));
            }
        }
    }
    let mut report = String::new();
    for (tag, (seed, detail, is2d)) in &unexpected {
        let tag: &'static str = tag;
        let json = if *is2d {
            let (m, d, _) = model_2d(*seed);
            let small = shrink_2d(m, &|t| guarded("2d.panic", || check_2d(t, &d, *seed)).fails.contains_key(tag));
            serde_json::to_string(&small).unwrap()
        } else {
            let (m, d, _) = model_3d(*seed);
            let small = shrink_3d(m, &|t| guarded("3d.panic", || check_3d(t, &d, *seed)).fails.contains_key(tag));
            serde_json::to_string(&small).unwrap()
        };
        report.push_str(&format!("\n{tag} (seed {seed}): {detail}\n  minimal model: {json}\n"));
    }
    std::panic::set_hook(hook);
    println!("assembly-path oracle: {n2d} 2D + {n3d} 3D models from seed {base}");
    println!("  connectors dropped on non-3/6-DOF nodes (KNOWN (b)): {stripped} models");
    for (tag, (count, first)) in &tally {
        let why = KNOWN.iter().chain(REPORTED).find(|(t, _)| t == tag).map_or("UNEXPECTED", |(_, w)| w);
        println!("  {tag:<32} {count:>5} models (first seed {first})  {why}");
    }
    println!("  checks run (models):");
    for (tag, count) in &coverage {
        println!("    {tag:<32} {count:>5}");
    }
    assert!(unexpected.is_empty(), "assembly paths disagree:{report}");
    // Every comparison must have been reached: a generator change that stops
    // exercising a path would otherwise pass silently.
    let missing: Vec<&&str> = ALL_CHECKS.iter().filter(|t| !coverage.contains_key(**t)).collect();
    assert!(missing.is_empty(), "checks never reached by the sweep: {missing:?}");
}

const ALL_CHECKS: &[&str] = &[
    "2d.dof_map", "2d.dense.symmetric", "2d.assemble_2d.f", "2d.sparse.k_full", "2d.sparse.k_ff",
    "2d.sparse.artificial_dofs", "2d.sparse.max_diag", "2d.sparse.inclined", "2d.ex.k_full.raw", "2d.ex.k_full",
    "2d.ex.k_ff", "2d.ex.f", "2d.ex.artificial_scale", "2d.legacy.k_ff", "2d.legacy.f", "2d.legacy_parallel.k_ff",
    "2d.legacy_parallel.f", "2d.mass.sparse", "2d.mass.inclined_frame", "2d.kg.symmetric", "2d.kg.terms",
    "2d.kg.forces", "2d.constrained.k", "2d.constrained.m", "2d.constrained.kg", "2d.certify.k_ff",
    "2d.certify.rhs", "2d.buckling.k_ff", "2d.buckling.kg", "2d3d.dof_map", "2d3d.artificial", "2d3d.k", "2d3d.f", "2d3d.m",
    "2d3d.kg", "3d.dof_map", "3d.dense.symmetric", "3d.sparse.k_full", "3d.sparse.k_ff",
    "3d.sparse.artificial_dofs", "3d.sparse.max_diag", "3d.sparse.inclined", "3d.sparse.f", "3d.parallel.k_full",
    "3d.parallel.k_ff", "3d.parallel.artificial_dofs", "3d.parallel.max_diag", "3d.parallel.inclined",
    "3d.parallel.f", "3d.mass.sparse", "3d.mass.inclined_frame", "3d.kg.symmetric", "3d.kg.terms",
    "3d.kg.forces", "3d.constrained.k", "3d.constrained.m", "3d.constrained.kg", "3d.certify.k_ff",
    "3d.certify.rhs", "3d.buckling.k_ff", "3d.buckling.kg",
];

/// Default sweep, sized to stay well under 30 s in the debug test profile.
#[test]
fn assembly_paths_agree() {
    run_sweep(300, 120, 0);
}

/// The nightly sweep (`certify-large` job in .github/workflows/verify.yml).
#[test]
#[ignore = "large sweep, run nightly with --release"]
fn assembly_paths_agree_large() {
    run_sweep(40_000, 15_000, 1_000_000);
}


/// Reproduce one model: `ORACLE_SEED=<seed> ORACLE_DIM=2|3 cargo test --test
/// assembly_paths oracle_one -- --ignored --nocapture` prints its failed
/// checks and, for each, the shrunk model.
#[test]
#[ignore = "debugging aid"]
fn oracle_one() {
    let seed: u64 = std::env::var("ORACLE_SEED").ok().and_then(|s| s.parse().ok()).unwrap_or(0);
    let dim = std::env::var("ORACLE_DIM").unwrap_or_else(|_| "2".into());
    if dim == "2" {
        let (m, d, _) = model_2d(seed);
        for (tag, detail) in guarded("2d.panic", || check_2d(&m, &d, seed)).fails {
            let small = shrink_2d(m.clone(), &|t| guarded("2d.panic", || check_2d(t, &d, seed)).fails.contains_key(tag));
            println!("{tag}: {detail}\n  {}", serde_json::to_string(&small).unwrap());
        }
    } else {
        let (m, d, _) = model_3d(seed);
        for (tag, detail) in guarded("3d.panic", || check_3d(&m, &d, seed)).fails {
            let small = shrink_3d(m.clone(), &|t| guarded("3d.panic", || check_3d(t, &d, seed)).fails.contains_key(tag));
            println!("{tag}: {detail}\n  {}", serde_json::to_string(&small).unwrap());
        }
    }
}

// ─── minimal reproductions ──────────────────────────────────────────────────
//
// One per discrepancy class the sweep found. `KNOWN` ones belong to bugs
// fixed on other branches; `REPORTED` ones are new and documented here
// rather than fixed (see docs/verification/ASSEMBLY.md for why); the rest
// are regression tests of the fixes.

const E_MPA: f64 = 200_000.0;

fn model_2d_from(
    nodes: &[(usize, f64, f64)],
    elems: &[(usize, &str, usize, usize, bool, bool)],
    sups: Vec<SolverSupport>,
    loads: Vec<SolverLoad>,
) -> SolverInput {
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: E_MPA, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".to_string(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });
    SolverInput {
        nodes: nodes.iter().map(|&(id, x, z)| (id.to_string(), SolverNode { id, x, z })).collect(),
        materials,
        sections,
        elements: elems
            .iter()
            .map(|&(id, t, i, j, hs, he)| {
                (id.to_string(), SolverElement {
                    id, elem_type: t.into(), node_i: i, node_j: j, material_id: 1, section_id: 1,
                    hinge_start: hs, hinge_end: he,
                })
            })
            .collect(),
        supports: sups.into_iter().map(|s| (s.id.to_string(), s)).collect(),
        loads,
        constraints: vec![],
        connectors: HashMap::new(),
        solver_options: None,
    }
}

fn sup_2d(id: usize, node_id: usize, t: &str) -> SolverSupport {
    SolverSupport {
        id, node_id, support_type: t.into(),
        kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None,
    }
}

fn sup_3d(node_id: usize, restrained: [bool; 6]) -> SolverSupport3D {
    let [rx, ry, rz, rrx, rry, rrz] = restrained;
    SolverSupport3D {
        node_id, rx, ry, rz, rrx, rry, rrz,
        kx: None, ky: None, kz: None, krx: None, kry: None, krz: None,
        dx: None, dy: None, dz: None, drx: None, dry: None, drz: None,
        normal_x: None, normal_y: None, normal_z: None, is_inclined: None, rw: None, kw: None,
    }
}

fn inclined_3d(node_id: usize, normal: [f64; 3]) -> SolverSupport3D {
    let mut s = sup_3d(node_id, [false; 6]);
    s.is_inclined = Some(true);
    s.normal_x = Some(normal[0]);
    s.normal_y = Some(normal[1]);
    s.normal_z = Some(normal[2]);
    s
}

fn model_3d_from(
    nodes: &[(usize, [f64; 3])],
    elems: &[(usize, &str, usize, usize, usize)],
    sups: Vec<SolverSupport3D>,
    loads: Vec<SolverLoad3D>,
) -> SolverInput3D {
    let mut materials = HashMap::new();
    materials.insert("1".to_string(), SolverMaterial { id: 1, e: E_MPA, nu: 0.3 });
    let mut sections = HashMap::new();
    // 1 plain, 2 with warping, 3 very stiff. Only the referenced ones: any
    // section with `cw` turns on the seventh DOF for the whole model.
    for (id, a, i, cw) in [(1, 0.01, 1e-4, None), (2, 0.01, 1e-4, Some(1e-7)), (3, 10.0, 1.0, None)] {
        if id == 1 || elems.iter().any(|e| e.4 == id) {
            sections.insert(id.to_string(), SolverSection3D { id, name: None, a, iy: i, iz: 2.0 * i, j: 0.5 * i, cw, as_y: None, as_z: None });
        }
    }
    SolverInput3D {
        nodes: nodes.iter().map(|&(id, p)| (id.to_string(), SolverNode3D { id, x: p[0], y: p[1], z: p[2] })).collect(),
        materials,
        sections,
        elements: elems
            .iter()
            .map(|&(id, t, i, j, sec)| {
                (id.to_string(), SolverElement3D {
                    id, elem_type: t.into(), node_i: i, node_j: j, material_id: 1, section_id: sec,
                    release_my_start: false, release_my_end: false, release_mz_start: false, release_mz_end: false,
                    release_t_start: false, release_t_end: false,
                    local_yx: None, local_yy: None, local_yz: None, roll_angle: None,
                })
            })
            .collect(),
        supports: sups.into_iter().enumerate().map(|(k, s)| ((k + 1).to_string(), s)).collect(),
        loads,
        constraints: vec![],
        left_hand: None,
        plates: HashMap::new(),
        quads: HashMap::new(),
        quad9s: HashMap::new(),
        solid_shells: HashMap::new(),
        curved_shells: HashMap::new(),
        curved_beams: vec![],
        connectors: HashMap::new(),
        solver_options: None,
    }
}

fn steel() -> HashMap<String, f64> {
    let mut d = HashMap::new();
    d.insert("1".to_string(), 7850.0);
    d
}

fn assert_agree(what: &str, a: &[f64], b: &[f64], cols: usize) {
    if let Some(m) = mismatch(a, b, cols, TOL) {
        panic!("{what}: {m}");
    }
}

/// The `_ex` K against the dense one, both full n×n.
fn ex_vs_dense(input: &SolverInput) {
    let dn = DofNumbering::build_2d(input);
    let k = assemble_stiffness_2d(input, &dn).k;
    let ex = assemble_sparse_2d_ex(input, &dn, true);
    assert_agree("assemble_sparse_2d_ex k_full vs dense", &dense(ex.k_full.as_ref().unwrap()), &k, dn.n_total);
}

#[test]
fn known_ex_angled_spring() {
    let mut s = sup_2d(2, 2, "spring");
    s.kx = Some(1e4);
    s.ky = Some(2e4);
    s.angle = Some(0.6);
    ex_vs_dense(&model_2d_from(&[(1, 0.0, 0.0), (2, 4.0, 0.0)], &[(1, "frame", 1, 2, false, false)], vec![sup_2d(1, 1, "fixed"), s], vec![]));
}

#[test]
fn known_ex_inclined_roller() {
    let mut s = sup_2d(2, 2, "inclinedRoller");
    s.angle = Some(0.5);
    ex_vs_dense(&model_2d_from(&[(1, 0.0, 0.0), (2, 4.0, 0.0)], &[(1, "frame", 1, 2, false, false)], vec![sup_2d(1, 1, "pinned"), s], vec![]));
}

#[test]
fn known_ex_orphan_rotation() {
    // Node 3 is reached only by a truss in a frame model: its rotation is bare.
    ex_vs_dense(&model_2d_from(
        &[(1, 0.0, 0.0), (2, 4.0, 0.0), (3, 4.0, 3.0)],
        &[(1, "frame", 1, 2, false, false), (2, "truss", 2, 3, false, false)],
        vec![sup_2d(1, 1, "fixed"), sup_2d(2, 3, "pinned")],
        vec![],
    ));
}

#[test]
fn known_ex_spring_on_restrained_dof() {
    let mut s = sup_2d(2, 2, "pinned");
    s.kx = Some(1e4);
    ex_vs_dense(&model_2d_from(&[(1, 0.0, 0.0), (2, 4.0, 0.0)], &[(1, "frame", 1, 2, false, false)], vec![sup_2d(1, 1, "fixed"), s], vec![]));
}

/// A connector between nodes 2 and 3 of a truss-only (2-DOF) model must put
/// the same translational stiffness as in a 3-DOF model.
#[test]
fn known_connector_on_two_dof_nodes() {
    let conn = ConnectorElement { id: 1, node_i: 2, node_j: 3, k_axial: 1e5, k_shear: 3e4, k_moment: 0.0, k_shear_z: 0.0, k_bend_y: 0.0, k_bend_z: 0.0 };
    let mut truss = model_2d_from(
        &[(1, 0.0, 0.0), (2, 3.0, 0.0), (3, 4.0, 1.0)],
        &[(1, "truss", 1, 2, false, false)],
        vec![sup_2d(1, 1, "pinned")],
        vec![],
    );
    truss.connectors.insert("1".into(), conn);
    // The same plus an unconnected fixed frame, which makes every node 3-DOF.
    let mut framed = truss.clone();
    framed.nodes.insert("8".into(), SolverNode { id: 8, x: 10.0, z: 0.0 });
    framed.nodes.insert("9".into(), SolverNode { id: 9, x: 11.0, z: 0.0 });
    framed.elements.insert("9".into(), SolverElement { id: 9, elem_type: "frame".into(), node_i: 8, node_j: 9, material_id: 1, section_id: 1, hinge_start: false, hinge_end: false });
    framed.supports.insert("8".into(), sup_2d(8, 8, "fixed"));
    framed.supports.insert("9".into(), sup_2d(9, 9, "fixed"));
    let (dt, df) = (DofNumbering::build_2d(&truss), DofNumbering::build_2d(&framed));
    let (kt, kf) = (assemble_stiffness_2d(&truss, &dt).k, assemble_stiffness_2d(&framed, &df).k);
    let keys: Vec<(usize, usize)> = [1, 2, 3].iter().flat_map(|&n| [(n, 0), (n, 1)]).collect();
    let pick = |k: &[f64], dn: &DofNumbering| -> Vec<f64> {
        keys.iter().flat_map(|a| keys.iter().map(move |b| (a, b))).map(|(a, b)| k[dn.map[a] * dn.n_total + dn.map[b]]).collect()
    };
    assert_agree("2-DOF vs 3-DOF connector stiffness", &pick(&kt, &dt), &pick(&kf, &df), keys.len());
}

/// A connector in a warping (7-DOF) model must assemble like in a 6-DOF one.
#[test]
fn known_connector_on_warping_nodes() {
    let mut m = model_3d_from(
        &[(1, [0.0, 0.0, 0.0]), (2, [3.0, 0.0, 0.0]), (3, [3.0, 1.0, 0.0])],
        &[(1, "frame", 1, 2, 2)],
        vec![sup_3d(1, [true; 6])],
        vec![],
    );
    m.connectors.insert("1".into(), ConnectorElement { id: 1, node_i: 2, node_j: 3, k_axial: 1e5, k_shear: 3e4, k_moment: 1e3, k_shear_z: 2e4, k_bend_y: 5e3, k_bend_z: 4e3 });
    let dn = DofNumbering::build_3d(&m);
    let k = std::panic::catch_unwind(|| assemble_stiffness_3d(&m, &dn).k).expect("3D assembly panicked");
    let mut plain = m.clone();
    plain.sections.get_mut("2").unwrap().cw = None;
    let dp = DofNumbering::build_3d(&plain);
    let kp = assemble_stiffness_3d(&plain, &dp).k;
    let keys: Vec<(usize, usize)> = [2, 3].iter().flat_map(|&n| (0..6).map(move |d| (n, d))).collect();
    let pick = |k: &[f64], dn: &DofNumbering| -> Vec<f64> {
        keys.iter().flat_map(|a| keys.iter().map(move |b| (a, b))).map(|(a, b)| k[dn.map[a] * dn.n_total + dn.map[b]]).collect()
    };
    // Node 2 also carries the frame, whose torsion differs with warping:
    // compare the connector's node 3 block and the 2–3 coupling only.
    let (a, b) = (pick(&k, &dn), pick(&kp, &dp));
    let n = keys.len();
    let sel = |v: &[f64]| -> Vec<f64> { (0..n * n).filter(|p| p / n >= 6 || p % n >= 6).map(|p| v[p]).collect() };
    assert_agree("warping vs plain connector stiffness", &sel(&a), &sel(&b), 1);
}

#[test]
fn reported_ex_artificial_stiffness_scale() {
    // Node 3's rotation is hinged out (artificial stiffness); the largest
    // diagonal sits on the fixed node 1.
    let m = model_2d_from(
        &[(1, 0.0, 0.0), (2, 4.0, 1.0), (3, -4.0, 0.5)],
        &[(1, "truss", 1, 2, false, false), (2, "frame", 3, 1, true, false)],
        vec![sup_2d(1, 1, "fixed"), sup_2d(2, 2, "pinned")],
        vec![],
    );
    let dn = DofNumbering::build_2d(&m);
    let d = dn.map[&(3, 2)];
    let k = assemble_stiffness_2d(&m, &dn).k;
    let ex = dense(&assemble_sparse_2d_ex(&m, &dn, false).k_ff);
    assert_agree("artificial rotational stiffness", &[ex[d * dn.n_free + d]], &[k[d * dn.n_total + d]], 1);
}

#[test]
#[ignore = "NEW, reported: legacy triplet assemblers (benches only) drop truss member and thermal loads and connectors"]
fn reported_legacy_triplet_assemblers() {
    let m = model_2d_from(
        &[(1, 0.0, 0.0), (2, 4.0, 3.0)],
        &[(1, "truss", 1, 2, false, false)],
        vec![sup_2d(1, 1, "pinned")],
        vec![SolverLoad::Thermal(SolverThermalLoad { element_id: 1, dt_uniform: 30.0, dt_gradient: 0.0 })],
    );
    let dn = DofNumbering::build_2d(&m);
    let f = assemble_load_vector_2d(&m, &m.loads, &dn, &[]);
    assert_agree("assemble_2d_sparse f", &assemble_2d_sparse(&m, &dn).f, &f, 1);
    assert_agree("assemble_elements_parallel_2d f", &assemble_elements_parallel_2d(&m, &dn).f, &f, 1);
}

/// A beam whose end slides along it: physically the same structure in any
/// orientation, so the modal frequencies must not depend on it. Rotated, the
/// slide is an inclined roller and K is assembled in its frame; M is not.
#[test]
fn reported_modal_inclined_roller_frequencies_depend_on_orientation() {
    let beam = |phi: f64| {
        let pts: Vec<(usize, f64, f64)> = (0..5).map(|k| (k + 1, k as f64 * 1.5 * phi.cos(), k as f64 * 1.5 * phi.sin())).collect();
        let elems: Vec<(usize, &str, usize, usize, bool, bool)> = (1..5).map(|k| (k, "frame", k, k + 1, false, false)).collect();
        let end = if phi == 0.0 {
            sup_2d(2, 5, "rollerX")
        } else {
            // Restrained normal (sin θ, cos θ) = (−sin φ, cos φ).
            let mut s = sup_2d(2, 5, "inclinedRoller");
            s.angle = Some(-phi);
            s
        };
        model_2d_from(&pts, &elems, vec![sup_2d(1, 1, "fixed"), end], vec![])
    };
    let f = |m: &SolverInput| -> Vec<f64> {
        dedaliano_engine::solver::modal::solve_modal_2d(m, &steel(), 4).unwrap().modes.iter().map(|m| m.frequency).collect()
    };
    assert_agree("frequencies, rotated vs not", &f(&beam(0.7)), &f(&beam(0.0)), 1);
}

#[test]
fn reported_modal_3d_inclined_support_frequencies_depend_on_orientation() {
    let beam = |phi: f64| {
        // Rotated about +y by φ: x → (cos φ, 0, −sin φ), z → (sin φ, 0, cos φ).
        let pts: Vec<(usize, [f64; 3])> = (0..5).map(|k| (k + 1, [k as f64 * 1.5 * phi.cos(), 0.0, -(k as f64) * 1.5 * phi.sin()])).collect();
        let elems: Vec<(usize, &str, usize, usize, usize)> = (1..5).map(|k| (k, "frame", k, k + 1, 1)).collect();
        let end = if phi == 0.0 { sup_3d(5, [false, false, true, false, false, false]) } else { inclined_3d(5, [phi.sin(), 0.0, phi.cos()]) };
        model_3d_from(&pts, &elems, vec![sup_3d(1, [true; 6]), end], vec![])
    };
    let f = |m: &SolverInput3D| -> Vec<f64> {
        dedaliano_engine::solver::modal::solve_modal_3d(m, &steel(), 4).unwrap().modes.iter().map(|m| m.frequency).collect()
    };
    assert_agree("frequencies, rotated vs not", &f(&beam(0.7)), &f(&beam(0.0)), 1);
}

/// 2D buckling: K_G must be in the frame of K. Latent today: the 2D buckling
/// K comes from `assemble_sparse_2d_ex`, which does not rotate either (known
/// bug, fix/sparse2d); once it does, K_G has to follow.
#[test]
fn reported_buckling_2d_kg_not_rotated() {
    let mut top = sup_2d(2, 2, "inclinedRoller");
    top.angle = Some(1.2);
    let m = model_2d_from(
        &[(1, 0.0, 0.0), (2, 0.0, 4.0)],
        &[(1, "frame", 1, 2, false, false)],
        vec![sup_2d(1, 1, "fixed"), top],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 2, fx: 0.0, fz: -100.0, my: 0.0 })],
    );
    let sys = buckling_system_2d(&m).unwrap();
    let (n, nf) = (sys.dof_num.n_total, sys.dof_num.n_free);
    let st = assemble_stiffness_2d(&m, &sys.dof_num);
    let mut kg = dense(&build_kg_from_forces_2d(&m, &all_free(&sys.dof_num), &sys.linear.element_forces, &[]).into_csc());
    rotate_all_2d(&mut kg, n, &st.inclined_transforms_2d);
    let free: Vec<usize> = (0..nf).collect();
    let neg: Vec<f64> = block(&kg, n, &free).iter().map(|v| -v).collect();
    assert_agree("buckling −K_G vs rotated reference", &dense(&sys.neg_kg_csc), &neg, nf);
}

/// The leaning-column frame of tests/geometric_stiffness_releases.rs in 2D:
/// a cantilever braces a column hinged at both ends, which only takes away
/// its string stiffness P/h, so P_cr = k·h = 3EI/h².
#[test]
fn hinged_members_geometric_stiffness_2d() {
    let h = 4.0;
    let mut m = model_2d_from(
        &[(1, 0.0, 0.0), (2, 0.0, h), (3, 6.0, 0.0), (4, 6.0, h)],
        &[(1, "frame", 1, 2, false, false), (2, "frame", 3, 4, true, true), (3, "frame", 2, 4, true, true)],
        vec![sup_2d(1, 1, "fixed"), sup_2d(2, 3, "pinned")],
        vec![SolverLoad::Nodal(SolverNodalLoad { node_id: 4, fx: 0.0, fz: -100.0, my: 0.0 })],
    );
    // A stiff link, so its axial shortening does not soften the sway.
    m.sections.insert("2".into(), SolverSection { id: 2, a: 10.0, iz: 1e-4, as_y: None });
    m.elements.get_mut("3").unwrap().section_id = 2;
    let p_cr = 3.0 * E_MPA * 1000.0 * 1e-4 / (h * h);
    let lambda = dedaliano_engine::solver::buckling::solve_buckling_2d(&m, 1).unwrap().modes[0].load_factor;
    assert!((lambda * 100.0 / p_cr - 1.0).abs() < 1e-4, "P_cr = {} vs k·h = {p_cr}", lambda * 100.0);

    // And the 2D K_G of a hinged member is the 3D one in the XZ plane.
    for (hs, he) in [(true, false), (false, true), (true, true)] {
        let p = model_2d_from(&[(1, 0.3, -0.2), (2, 3.1, 1.7)], &[(1, "frame", 1, 2, hs, he)], vec![], vec![]);
        let mut c = Checks::default();
        check_embedding(&mut c, &p, &steel(), 7);
        assert!(c.fails.is_empty(), "hinges ({hs}, {he}): {:?}", c.fails);
    }
}

/// Warping DOFs no element stiffens get artificial stiffness scaled by the
/// largest diagonal; the sparse paths took it over the free DOFs only.
#[test]
fn sparse_3d_artificial_warping_stiffness_matches_dense() {
    // Element 2 has no warping, so node 3's warping DOF is bare; element 3,
    // stiff and between fixed nodes, holds the largest diagonal.
    let m = model_3d_from(
        &[(1, [0.0, 0.0, 0.0]), (2, [3.0, 0.0, 0.0]), (3, [3.0, 0.0, 3.0]), (4, [0.0, 3.0, 0.0])],
        &[(1, "frame", 1, 2, 2), (2, "frame", 2, 3, 1), (3, "frame", 1, 4, 3)],
        vec![sup_3d(1, [true; 6]), sup_3d(4, [true; 6])],
        vec![],
    );
    let dn = DofNumbering::build_3d(&m);
    let (n, nf) = (dn.n_total, dn.n_free);
    let st = assemble_stiffness_3d(&m, &dn);
    let free: Vec<usize> = (0..nf).collect();
    for sp in [assemble_stiffness_sparse_3d(&m, &dn, true), assemble_stiffness_sparse_3d_parallel(&m, &dn, true)] {
        assert_agree("max_diag_k", &[sp.max_diag_k], &[st.max_diag_k], 1);
        assert_agree("K_ff", &dense(&sp.k_ff), &block(&st.k, n, &free), nf);
    }
}

/// Buckling is invariant under a rigid rotation of the whole model: rotated,
/// the top's guide is an inclined support, K is assembled in its frame and
/// K_G must follow; the mode shape is reported in global axes.
#[test]
fn buckling_3d_invariant_under_rotation_with_inclined_support() {
    let column = |phi: f64| {
        // Rotated about +y by φ: x → (cos φ, 0, −sin φ), z → (sin φ, 0, cos φ).
        let rot = |v: [f64; 3]| [v[0] * phi.cos() + v[2] * phi.sin(), v[1], -v[0] * phi.sin() + v[2] * phi.cos()];
        let top = rot([0.0, 0.0, 4.0]);
        let guide = if phi == 0.0 { sup_3d(2, [true, false, false, false, false, false]) } else { inclined_3d(2, rot([1.0, 0.0, 0.0])) };
        let p = rot([0.0, 0.0, -100.0]);
        model_3d_from(
            &[(1, [0.0, 0.0, 0.0]), (2, top)],
            &[(1, "frame", 1, 2, 1)],
            vec![sup_3d(1, [true; 6]), guide],
            vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: p[0], fy: p[1], fz: p[2], mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
        )
    };
    let solve = |m: &SolverInput3D| dedaliano_engine::solver::buckling::solve_buckling_3d(m, 1).unwrap();
    let (a, b) = (solve(&column(0.0)), solve(&column(0.6)));
    assert_agree("critical factor", &[b.modes[0].load_factor], &[a.modes[0].load_factor], 1);
    // The top's mode displacement, rotated back, is the unrotated one (up to sign).
    let top = |r: &dedaliano_engine::solver::buckling::BucklingResult3D| {
        let d = r.modes[0].displacements.iter().find(|d| d.node_id == 2).unwrap().clone();
        [d.ux, d.uy, d.uz]
    };
    let (ta, tb) = (top(&a), top(&b));
    let back = [tb[0] * 0.6f64.cos() - tb[2] * 0.6f64.sin(), tb[1], tb[0] * 0.6f64.sin() + tb[2] * 0.6f64.cos()];
    let sign = if back[1] * ta[1] + back[0] * ta[0] < 0.0 { -1.0 } else { 1.0 };
    let back: Vec<f64> = back.iter().map(|v| sign * v).collect();
    if let Some(m) = mismatch(&back, &ta, 1, 1e-8) {
        panic!("mode shape at the top: {m}");
    }
}

/// A curved beam, the only member of an arch: every 3D solver expands it
/// into segments (`expand_curved_beams_3d`); modal, buckling, harmonic and
/// the reductions assembled the unexpanded model and ignored it (buckling
/// panicked on the expanded element forces).
fn arch_3d() -> SolverInput3D {
    let mut m = model_3d_from(
        &[(1, [0.0, 0.0, 0.0]), (2, [5.0, 0.0, 3.0]), (3, [10.0, 0.0, 0.0])],
        &[],
        vec![sup_3d(1, [true; 6]), sup_3d(3, [true; 6])],
        vec![SolverLoad3D::Nodal(SolverNodalLoad3D { node_id: 2, fx: 0.0, fy: 0.0, fz: -100.0, mx: 0.0, my: 0.0, mz: 0.0, bw: None })],
    );
    m.curved_beams.push(CurvedBeamInput { node_start: 1, node_mid: 2, node_end: 3, material_id: 1, section_id: 1, num_segments: 8, hinge_start: false, hinge_end: false });
    m
}

#[test]
fn curved_beams_reach_every_3d_solver() {
    use dedaliano_engine::solver::{harmonic, modal, reduction};
    let a = arch_3d();
    let e = dedaliano_engine::solver::linear::expand_curved_beams_3d(&a);
    let freqs = |m: &SolverInput3D| -> Vec<f64> { modal::solve_modal_3d(m, &steel(), 3).unwrap().modes.iter().map(|m| m.frequency).collect() };
    assert_agree("modal frequencies", &freqs(&a), &freqs(&e), 1);
    let lam = |m: &SolverInput3D| dedaliano_engine::solver::buckling::solve_buckling_3d(m, 1).unwrap().modes[0].load_factor;
    let la = std::panic::catch_unwind(|| lam(&a)).expect("3D buckling panicked on a curved beam");
    assert_agree("critical factor", &[la], &[lam(&e)], 1);
    let amp = |m: &SolverInput3D| {
        harmonic::solve_harmonic_3d(&harmonic::HarmonicInput3D {
            solver: m.clone(), densities: steel(), frequencies: vec![1.0, 5.0], damping_ratio: 0.05,
            response_node_id: 2, response_dof: "z".into(),
        })
        .unwrap()
        .response_points
        .iter()
        .map(|p| p.amplitude)
        .collect::<Vec<f64>>()
    };
    assert_agree("harmonic amplitudes", &amp(&a), &amp(&e), 1);
    let guyan = |m: &SolverInput3D| reduction::guyan_reduce_3d(&reduction::GuyanInput3D { solver: m.clone(), boundary_nodes: vec![2] }).unwrap().k_condensed;
    assert_agree("Guyan condensed K", &guyan(&a), &guyan(&e), 1);
    // The certificates check the model the solvers analyzed.
    let cm = dedaliano_engine::certify::modal::certify_modal_3d(&a, &steel(), 3).unwrap();
    assert!(cm.certificate.is_certified(), "modal certificate: {:?}", cm.certificate);
}

/// The parallel sparse load vector (`--features parallel`) left the quad and
/// quad9 self-weight in the element's local axes. Without the feature both
/// names resolve to the sequential assembler and this passes trivially.
#[test]
fn parallel_load_vector_self_weight_in_global_axes() {
    let mut m = model_3d_from(
        &[(1, [0.0, 0.0, 0.0]), (2, [2.0, 0.0, 1.0]), (3, [2.0, 2.0, 1.5]), (4, [0.0, 2.0, 0.5])],
        &[],
        vec![sup_3d(1, [true; 6])],
        vec![SolverLoad3D::QuadSelfWeight(SolverQuadSelfWeightLoad { element_id: 1, density: 2500.0, gx: 1.0, gy: -2.0, gz: -9.81 })],
    );
    m.quads.insert("1".into(), SolverQuadElement { id: 1, nodes: [1, 2, 3, 4], material_id: 1, thickness: 0.2 });
    let dn = DofNumbering::build_3d(&m);
    let f = assemble_load_vector_3d_dense(&m, &m.loads, &dn, &[]);
    assert_agree("sparse_3d (parallel) vs dense load vector", &assemble_load_vector_sparse_3d(&m, &m.loads, &dn, &[]), &f, 1);
}
