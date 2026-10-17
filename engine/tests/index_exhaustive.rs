//! Exhaustive small-case checks of the index plumbing around K: DOF numbering,
//! fill-reducing orderings, CSC construction/permutation and sparse vs dense
//! assembly. Each enumerates every configuration of a tiny model, so a pass is
//! a proof for that bounded space (the Kani harnesses in src/kani_proofs.rs
//! cover the same properties symbolically where CBMC is fast enough; see
//! docs/verification/KANI.md).

mod common;

use common::make_3d_input;
use dedaliano_engine::linalg::amd::{amd_order, inverse_perm};
use dedaliano_engine::linalg::rcm::rcm_order;
use dedaliano_engine::linalg::sparse::CscMatrix;
use dedaliano_engine::solver::assembly::{assemble_sparse_2d_ex, assemble_stiffness_2d};
use dedaliano_engine::solver::dof::DofNumbering;
use dedaliano_engine::solver::sparse_assembly::assemble_stiffness_sparse_2d;
use dedaliano_engine::types::*;
use std::collections::HashMap;

// ─── orderings ──────────────────────────────────────────────────────────────

/// Lower-triangle CSC of the graph on n vertices whose edges are the set bits
/// of `mask` (strictly-lower positions in column-major order), with or
/// without the diagonal.
fn graph_csc(n: usize, mask: u32, diag: bool) -> (Vec<usize>, Vec<usize>) {
    let mut col_ptr = vec![0];
    let mut row_idx = Vec::new();
    let mut bit = 0;
    for j in 0..n {
        if diag {
            row_idx.push(j);
        }
        for i in (j + 1)..n {
            if mask >> bit & 1 == 1 {
                row_idx.push(i);
            }
            bit += 1;
        }
        col_ptr.push(row_idx.len());
    }
    (col_ptr, row_idx)
}

fn assert_perm(perm: &[usize], n: usize, what: &str) {
    assert_eq!(perm.len(), n, "{what}");
    let mut seen = vec![false; n];
    for &p in perm {
        assert!(p < n && !seen[p], "{what}: {perm:?}");
        seen[p] = true;
    }
    let ip = inverse_perm(perm);
    for i in 0..n {
        assert_eq!(ip[perm[i]], i, "{what}");
        assert_eq!(perm[ip[i]], i, "{what}");
    }
}

/// AMD and RCM return permutations (and inverse_perm inverts them) for every
/// graph on up to 6 vertices (32768 graphs on 6), with and without diagonal.
#[test]
fn orderings_are_permutations_for_every_small_graph() {
    for n in 0..=6usize {
        let edges = n * n.saturating_sub(1) / 2;
        for mask in 0..(1u32 << edges) {
            for diag in [true, false] {
                let (cp, ri) = graph_csc(n, mask, diag);
                assert_perm(&amd_order(n, &cp, &ri), n, &format!("amd n={n} mask={mask:#x}"));
                assert_perm(&rcm_order(n, &cp, &ri), n, &format!("rcm n={n} mask={mask:#x}"));
            }
        }
    }
}

// ─── CSC ────────────────────────────────────────────────────────────────────

struct Lcg(u64);
impl Lcg {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        self.0 >> 33
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}

fn check_csc(m: &CscMatrix) {
    assert_eq!(m.col_ptr.len(), m.n + 1);
    assert_eq!(m.col_ptr[0], 0);
    assert!(m.col_ptr.windows(2).all(|w| w[0] <= w[1]));
    assert_eq!(m.col_ptr[m.n], m.row_idx.len());
    assert_eq!(m.row_idx.len(), m.values.len());
    for j in 0..m.n {
        let rows = &m.row_idx[m.col_ptr[j]..m.col_ptr[j + 1]];
        assert!(rows.iter().all(|&i| i >= j && i < m.n), "col {j}: {rows:?}");
        assert!(rows.windows(2).all(|w| w[0] < w[1]), "col {j} not strictly sorted: {rows:?}");
    }
}

/// from_triplets: invariants; dense equals the mirrored sum of the triplets
/// (integer values, so every summation order is exact); nnz equals the
/// number of distinct lower positions; permute_symmetric(P) gives
/// B[i][j] = A[P[i]][P[j]] for random permutations.
#[test]
fn csc_from_triplets_and_permute_random() {
    let mut g = Lcg(2024);
    for _ in 0..20_000 {
        let n = 1 + g.below(6);
        let m = g.below(12);
        let (mut rows, mut cols, mut vals) = (vec![], vec![], vec![]);
        for _ in 0..m {
            rows.push(g.below(n));
            cols.push(g.below(n));
            vals.push(g.below(21) as f64 - 10.0);
        }
        let a = CscMatrix::from_triplets(n, &rows, &cols, &vals);
        check_csc(&a);
        let mut dense = vec![0.0; n * n];
        let mut touched = std::collections::HashSet::new();
        for t in 0..m {
            let (r, c) = (rows[t].max(cols[t]), rows[t].min(cols[t]));
            dense[r * n + c] += vals[t];
            touched.insert((r, c));
        }
        assert_eq!(a.nnz(), touched.len());
        let d = a.to_dense_symmetric();
        for i in 0..n {
            for j in 0..=i {
                assert_eq!(d[i * n + j], dense[i * n + j]);
                assert_eq!(d[j * n + i], dense[i * n + j]);
            }
        }
        let mut perm: Vec<usize> = (0..n).collect();
        for i in (1..n).rev() {
            perm.swap(i, g.below(i + 1));
        }
        let b = a.permute_symmetric(&perm);
        check_csc(&b);
        let db = b.to_dense_symmetric();
        for i in 0..n {
            for j in 0..n {
                assert_eq!(db[i * n + j], d[perm[i] * n + perm[j]]);
            }
        }
    }
}

// ─── DOF numbering ──────────────────────────────────────────────────────────

const SUPPORT_TYPES_2D: [&str; 10] =
    ["fixed", "pinned", "rollerX", "rollerY", "rollerZ", "guidedX", "guidedY", "guidedZ", "inclinedRoller", "spring"];

/// Independent spec of which 2D local DOFs (ux, uz, ry) each support type restrains.
fn spec_restrained_2d(t: &str, local: usize) -> bool {
    match t {
        "fixed" => true,
        "pinned" => local < 2,
        "rollerX" | "inclinedRoller" => local == 1,
        "rollerY" | "rollerZ" => local == 0,
        "guidedX" => local != 0,
        "guidedY" | "guidedZ" => local != 1,
        "spring" => false,
        _ => unreachable!(),
    }
}

/// Bijection (node, local) ↔ 0..n_total; free DOFs first; within each class
/// numbered in (node id, local dof) order; restrained set as `restrained`.
fn check_numbering(dn: &DofNumbering, ids: &[usize], dpn: usize, restrained: impl Fn(usize, usize) -> bool) {
    assert_eq!(dn.dofs_per_node, dpn);
    assert_eq!(dn.n_total, ids.len() * dpn);
    assert_eq!(dn.map.len(), dn.n_total);
    let mut sorted = ids.to_vec();
    sorted.sort();
    let mut seen = vec![false; dn.n_total];
    let (mut next_free, mut next_fixed) = (0, dn.n_free);
    for &id in &sorted {
        for l in 0..dpn {
            let g = dn.global_dof(id, l).expect("every node DOF is numbered");
            assert!(g < dn.n_total && !seen[g]);
            seen[g] = true;
            if restrained(id, l) {
                assert_eq!(g, next_fixed, "node {id} dof {l}");
                next_fixed += 1;
            } else {
                assert_eq!(g, next_free, "node {id} dof {l}");
                next_free += 1;
            }
        }
        assert!(dn.global_dof(id, dpn).is_none());
    }
    assert_eq!((next_free, next_fixed), (dn.n_free, dn.n_total));
}

fn input_2d(ids: [usize; 3], types: [&str; 2], hinges: [bool; 4], sups: [Option<&str>; 3], springs: bool) -> SolverInput {
    let xy = [(0.0, 0.0), (3.0, 0.0), (3.0, 4.0)];
    let mut nodes = HashMap::new();
    for k in 0..3 {
        nodes.insert(format!("n{k}"), SolverNode { id: ids[k], x: xy[k].0, z: xy[k].1 });
    }
    let mut materials = HashMap::new();
    materials.insert("1".into(), SolverMaterial { id: 1, e: 200000.0, nu: 0.3 });
    let mut sections = HashMap::new();
    sections.insert("1".into(), SolverSection { id: 1, a: 0.01, iz: 1e-4, as_y: None });
    let mut elements = HashMap::new();
    for e in 0..2 {
        elements.insert(format!("e{e}"), SolverElement {
            id: e + 1,
            elem_type: types[e].into(),
            node_i: ids[e],
            node_j: ids[e + 1],
            material_id: 1,
            section_id: 1,
            hinge_start: hinges[2 * e],
            hinge_end: hinges[2 * e + 1],
        });
    }
    let mut supports = HashMap::new();
    for k in 0..3 {
        if let Some(t) = sups[k] {
            let sp = if springs { Some(1e3) } else { None };
            supports.insert(format!("s{k}"), SolverSupport {
                id: k + 1,
                node_id: ids[k],
                support_type: t.into(),
                kx: sp, ky: sp, kz: sp, dx: None, dz: None, dry: None, angle: None,
            });
        }
    }
    SolverInput {
        nodes, materials, sections, elements, supports,
        loads: vec![], constraints: vec![], connectors: HashMap::new(), solver_options: None,
    }
}

/// Every combination of member types, support type (or none) on each of 3
/// nodes, with and without spring constants, and two node-id orders.
#[test]
fn dof_numbering_2d_exhaustive() {
    let opts: Vec<Option<&str>> = std::iter::once(None).chain(SUPPORT_TYPES_2D.iter().map(|t| Some(*t))).collect();
    for ids in [[1, 2, 3], [7, 2, 5]] {
        for types in [["frame", "frame"], ["frame", "truss"], ["truss", "truss"], ["truss", "cable"]] {
            let dpn = if types.contains(&"frame") { 3 } else { 2 };
            for &s0 in &opts {
                for &s1 in &opts {
                    for &s2 in &opts {
                        for springs in [false, true] {
                            let sups = [s0, s1, s2];
                            let input = input_2d(ids, types, [false; 4], sups, springs);
                            let dn = DofNumbering::build_2d(&input);
                            check_numbering(&dn, &ids, dpn, |id, l| {
                                let k = ids.iter().position(|&i| i == id).unwrap();
                                sups[k].is_some_and(|t| spec_restrained_2d(t, l))
                            });
                            let ed = dn.element_dofs(ids[0], ids[1]);
                            let expect: Vec<usize> = (0..dpn)
                                .map(|l| dn.global_dof(ids[0], l).unwrap())
                                .chain((0..dpn).map(|l| dn.global_dof(ids[1], l).unwrap()))
                                .collect();
                            assert_eq!(ed, expect);
                        }
                    }
                }
            }
        }
    }
}

/// 3D: every restraint pattern on each of 2 nodes (64 × 64), with frames
/// (6 DOFs/node) and trusses only (3), plus springs that free a restrained DOF.
#[test]
fn dof_numbering_3d_exhaustive() {
    for elem_type in ["frame", "truss"] {
        let dpn = if elem_type == "frame" { 6 } else { 3 };
        for m0 in 0..64u32 {
            for m1 in 0..64u32 {
                for spring_dof in [None, Some((m0 + m1) as usize % 6)] {
                    let flags = |m: u32| (0..6).map(|b| m >> b & 1 == 1).collect::<Vec<bool>>();
                    let mut input = make_3d_input(
                        vec![(4, 0.0, 0.0, 0.0), (9, 2.0, 1.0, 0.5)],
                        vec![(1, 200000.0, 0.3)],
                        vec![(1, 0.01, 1e-4, 1e-4, 2e-4)],
                        vec![(1, elem_type, 4, 9, 1, 1)],
                        vec![(4, flags(m0)), (9, flags(m1))],
                        vec![],
                    );
                    if let Some(d) = spring_dof {
                        for s in input.supports.values_mut() {
                            let k = Some(1e3);
                            match d {
                                0 => s.kx = k,
                                1 => s.ky = k,
                                2 => s.kz = k,
                                3 => s.krx = k,
                                4 => s.kry = k,
                                _ => s.krz = k,
                            }
                        }
                    }
                    let dn = DofNumbering::build_3d(&input);
                    check_numbering(&dn, &[4, 9], dpn, |id, l| {
                        let m = if id == 4 { m0 } else { m1 };
                        m >> l & 1 == 1 && spring_dof != Some(l)
                    });
                }
            }
        }
    }
}

// ─── sparse vs dense assembly ───────────────────────────────────────────────
//
// Two 2D sparse assemblers mirror the dense `assemble_stiffness_2d`:
//   L = sparse_assembly::assemble_stiffness_sparse_2d — linear static path
//       (nf ≥ 64);
//   T = assembly::assemble_sparse_2d_ex — time integration, buckling and
//       kinematic analysis (built on L's stiffness).
// Both are compared with dense on every combination of member type, hinges
// and support type (springs with and without an angle, inclined rollers) on a
// 3-node, 2-member model.

/// Dense matrix (row-major n×n) of a lower-triangle CSC.
fn dense_of(m: &CscMatrix) -> Vec<f64> {
    m.to_dense_symmetric()
}

fn assert_same(what: &str, sparse: &[f64], ns: usize, dense: &[f64], nd: usize, tol: f64) {
    for i in 0..ns {
        for j in 0..ns {
            let (s, d) = (sparse[i * ns + j], dense[i * nd + j]);
            assert!((s - d).abs() <= tol, "{what}: [{i},{j}] sparse {s} vs dense {d}");
        }
    }
}

/// Every support option on a node: none, each type, a spring with constants
/// (optionally at an angle), an inclined roller at an angle.
fn support_options() -> Vec<(Option<&'static str>, bool, Option<f64>)> {
    let mut v: Vec<(Option<&str>, bool, Option<f64>)> = vec![(None, false, None)];
    for t in SUPPORT_TYPES_2D {
        v.push((Some(t), false, None));
    }
    v.push((Some("spring"), true, None));
    v.push((Some("spring"), true, Some(0.6)));
    v.push((Some("inclinedRoller"), false, Some(0.6)));
    v
}

fn input_2d_opts(types: [&str; 2], hinges: [bool; 4], opts: [(Option<&str>, bool, Option<f64>); 3]) -> SolverInput {
    let sups = [opts[0].0, opts[1].0, opts[2].0];
    let mut input = input_2d([1, 2, 3], types, hinges, sups, false);
    for s in input.supports.values_mut() {
        let k = s.node_id - 1;
        if opts[k].1 {
            s.kx = Some(1e3);
            s.ky = Some(2e3);
            s.kz = Some(5e2);
        }
        s.angle = opts[k].2;
    }
    input
}

fn for_each_model(mut f: impl FnMut(&str, &SolverInput)) {
    let opts = support_options();
    for types in [["frame", "frame"], ["frame", "truss"], ["truss", "frame"], ["truss", "truss"]] {
        for h in 0..16u32 {
            let hinges = [h & 1 == 1, h & 2 == 2, h & 4 == 4, h & 8 == 8];
            for &o0 in &opts {
                for &o1 in &[opts[0], opts[3], opts[11], opts[12], opts[13]] {
                    for &o2 in &opts {
                        let input = input_2d_opts(types, hinges, [o0, o1, o2]);
                        let label = format!("{types:?} h={h:#x} {o0:?} / {o1:?} / {o2:?}");
                        f(&label, &input);
                    }
                }
            }
        }
    }
}

/// L (linear static sparse path) equals dense: K_ff, full K, artificial DOFs.
#[test]
fn assembly_2d_linear_sparse_matches_dense_exhaustive() {
    let mut cases = 0;
    for_each_model(|label, input| {
        let dn = DofNumbering::build_2d(input);
        let (n, nf) = (dn.n_total, dn.n_free);
        let dense = assemble_stiffness_2d(input, &dn);
        let sp = assemble_stiffness_sparse_2d(input, &dn);
        let tol = 1e-12 * dense.max_diag_k.max(1.0);
        assert_eq!(sp.k_ff.n, nf);
        assert_same(&format!("L k_ff {label}"), &dense_of(&sp.k_ff), nf, &dense.k, n, tol);
        assert_same(&format!("L k_full {label}"), &dense_of(&sp.k_full), n, &dense.k, n, tol);
        let (mut a, mut b) = (sp.artificial_dofs.clone(), dense.artificial_dofs.clone());
        a.sort();
        b.sort();
        assert_eq!(a, b, "L artificial {label}");
        cases += 1;
    });
    assert_eq!(cases, 4 * 16 * 14 * 5 * 14);
}

/// T (time integration / buckling / kinematic sparse path) equals dense on
/// K_ff, full K and artificial DOFs, on every model (it shares L's stiffness).
#[test]
fn assembly_2d_sparse_ex_matches_dense_exhaustive() {
    let mut cases = 0;
    for_each_model(|label, input| {
        let dn = DofNumbering::build_2d(input);
        let (n, nf) = (dn.n_total, dn.n_free);
        let dense = assemble_stiffness_2d(input, &dn);
        let sp = assemble_sparse_2d_ex(input, &dn, true);
        let tol = 1e-12 * dense.max_diag_k.max(1.0);
        assert_eq!(sp.k_ff.n, nf);
        assert_same(&format!("T k_ff {label}"), &dense_of(&sp.k_ff), nf, &dense.k, n, tol);
        assert_same(&format!("T k_full {label}"), &dense_of(sp.k_full.as_ref().unwrap()), n, &dense.k, n, tol);
        let (mut a, mut b) = (sp.artificial_dofs.clone(), dense.artificial_dofs.clone());
        a.sort();
        b.sort();
        assert_eq!(a, b, "T artificial {label}");
        cases += 1;
    });
    assert_eq!(cases, 4 * 16 * 14 * 5 * 14);
}

/// Regression: T ignored a spring's `angle`, giving a diagonal diag(kx, ky)
/// block in K_ff instead of Rᵀ·diag(kx, ky)·R (dense and the linear sparse
/// path rotate it), so time-history and buckling runs of a model with an
/// angled spring used a different K than statics.
#[test]
fn assembly_2d_sparse_ex_angled_spring() {
    let o = (None, false, None);
    let input = input_2d_opts(["frame", "frame"], [false; 4], [(Some("fixed"), false, None), (Some("spring"), true, Some(0.6)), o]);
    let dn = DofNumbering::build_2d(&input);
    let (n, nf) = (dn.n_total, dn.n_free);
    let dense = assemble_stiffness_2d(&input, &dn);
    let sp = assemble_sparse_2d_ex(&input, &dn, true);
    assert_same("T angled spring k_ff", &dense_of(&sp.k_ff), nf, &dense.k, n, 1e-9);
}

/// Regression: T's full K (`build_k_full`) omitted spring constants on
/// restrained DOFs (dense and L add them to K_rr). With a prescribed
/// displacement on such a DOF the reaction differed by k·δ between the paths.
#[test]
fn assembly_2d_sparse_ex_k_full_restrained_spring() {
    let o = (None, false, None);
    let input = input_2d_opts(["frame", "frame"], [false; 4], [(Some("pinned"), true, None), o, (Some("rollerX"), false, None)]);
    let dn = DofNumbering::build_2d(&input);
    let n = dn.n_total;
    let dense = assemble_stiffness_2d(&input, &dn);
    let sp = assemble_sparse_2d_ex(&input, &dn, true);
    assert_same("T k_full", &dense_of(sp.k_full.as_ref().unwrap()), n, &dense.k, n, 1e-9);
}

/// Regression: T lacked dense's orphan-rotation guard. In a frame model, a
/// node reached only by trusses has a free rotation DOF with an all-zero row;
/// dense (and L) add artificial stiffness there, T left K_ff singular.
#[test]
fn assembly_2d_sparse_ex_orphan_rotation() {
    let o = (None, false, None);
    let input = input_2d_opts(["frame", "truss"], [false; 4], [(Some("fixed"), false, None), o, (Some("pinned"), false, None)]);
    let dn = DofNumbering::build_2d(&input);
    let (n, nf) = (dn.n_total, dn.n_free);
    let dense = assemble_stiffness_2d(&input, &dn);
    let sp = assemble_sparse_2d_ex(&input, &dn, true);
    assert_same("T orphan rotation k_ff", &dense_of(&sp.k_ff), nf, &dense.k, n, 0.0);
}

/// Regression: T did not rotate K for an inclined roller, so its K_ff treated
/// the restrained local DOF as global uz, and 2D buckling and time integration
/// used it with no guard. T now rotates K (and f) like dense and reports the
/// rotations in `inclined_transforms_2d`.
#[test]
fn assembly_2d_sparse_ex_inclined_roller() {
    let o = (None, false, None);
    let input = input_2d_opts(["frame", "frame"], [false; 4], [(Some("pinned"), false, None), o, (Some("inclinedRoller"), false, Some(0.6))]);
    let dn = DofNumbering::build_2d(&input);
    let (n, nf) = (dn.n_total, dn.n_free);
    let dense = assemble_stiffness_2d(&input, &dn);
    let sp = assemble_sparse_2d_ex(&input, &dn, true);
    assert_same("T inclined roller k_ff", &dense_of(&sp.k_ff), nf, &dense.k, n, 1e-9);
}
