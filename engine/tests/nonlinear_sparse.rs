//! Sparse LDLᵀ and LU for the nonlinear framework's tangent systems
//! (src/nonlinear/sparse), against dense factorizations and eigenvalues.

use dedaliano_engine::linalg::jacobi::jacobi_eigen;
use dedaliano_engine::linalg::lu::{lu_apply, lu_factor};
use dedaliano_engine::nonlinear::sparse::*;
use std::rc::Rc;
use std::time::Instant;

/// A tiny deterministic generator: the same matrices on every machine.
struct Lcg(u64);

impl Lcg {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        ((self.0 >> 11) as f64) / ((1u64 << 53) as f64) * 2.0 - 1.0
    }
}

/// The 5- or 7-point Laplacian on an nx × ny × nz grid, plus `shift` on the
/// diagonal.
fn laplacian(nx: usize, ny: usize, nz: usize, shift: f64) -> SparseMatrix {
    let n = nx * ny * nz;
    let id = |i: usize, j: usize, k: usize| (k * ny + j) * nx + i;
    let mut groups = Vec::new();
    for k in 0..nz {
        for j in 0..ny {
            for i in 0..nx {
                if i + 1 < nx {
                    groups.push(vec![id(i, j, k), id(i + 1, j, k)]);
                }
                if j + 1 < ny {
                    groups.push(vec![id(i, j, k), id(i, j + 1, k)]);
                }
                if k + 1 < nz {
                    groups.push(vec![id(i, j, k), id(i, j, k + 1)]);
                }
            }
        }
    }
    let p = Rc::new(SparsePattern::from_groups(n, &groups));
    let mut a = SparseMatrix::zeros(Rc::clone(&p));
    for j in 0..n {
        for q in p.col_ptr[j]..p.col_ptr[j + 1] {
            let i = p.row_idx[q];
            a.values[q] = if i == j { 0.0 } else { -1.0 };
        }
        let deg = (p.col_ptr[j + 1] - p.col_ptr[j] - 1) as f64;
        a.values[p.position(j, j).unwrap()] = deg + shift;
    }
    a
}

/// A random sparse matrix on a random symmetric pattern: symmetric or not,
/// with `diag` added to the diagonal.
fn random(n: usize, per_row: usize, symmetric: bool, diag: f64, seed: u64) -> SparseMatrix {
    let mut r = Lcg(seed);
    let mut groups = Vec::new();
    for i in 0..n {
        for _ in 0..per_row {
            let j = ((r.next() + 1.0) / 2.0 * n as f64) as usize % n;
            groups.push(vec![i, j]);
        }
    }
    let p = Rc::new(SparsePattern::from_groups(n, &groups));
    let mut a = SparseMatrix::zeros(Rc::clone(&p));
    for j in 0..n {
        for q in p.col_ptr[j]..p.col_ptr[j + 1] {
            let i = p.row_idx[q];
            if i == j {
                a.values[q] = diag + r.next();
            } else if !symmetric || i > j {
                a.values[q] = r.next();
            }
        }
    }
    if symmetric {
        for j in 0..n {
            for q in p.col_ptr[j]..p.col_ptr[j + 1] {
                let i = p.row_idx[q];
                if i < j {
                    a.values[q] = a.values[p.position(j, i).unwrap()];
                }
            }
        }
    }
    a
}

fn rhs(n: usize, seed: u64) -> Vec<f64> {
    let mut r = Lcg(seed);
    (0..n).map(|_| r.next()).collect()
}

fn rel_residual(a: &SparseMatrix, x: &[f64], b: &[f64]) -> f64 {
    let ax = a.mat_vec(x);
    let num: f64 = ax.iter().zip(b).map(|(p, q)| (p - q) * (p - q)).sum::<f64>().sqrt();
    let den: f64 = b.iter().map(|v| v * v).sum::<f64>().sqrt();
    num / den
}

fn dense_solve(a: &SparseMatrix, b: &[f64]) -> Vec<f64> {
    let n = a.pattern.n;
    let mut d = a.to_dense();
    let piv = lu_factor(&mut d, n).unwrap();
    lu_apply(&d, &piv, b, n).unwrap()
}

fn dense_det_sign(a: &SparseMatrix) -> i8 {
    let n = a.pattern.n;
    let mut d = a.to_dense();
    let piv = lu_factor(&mut d, n).unwrap();
    let mut sign = 1i8;
    for k in 0..n {
        if d[piv[k] * n + k] < 0.0 {
            sign = -sign;
        }
    }
    let mut seen = vec![false; n];
    for s in 0..n {
        let (mut len, mut i) = (0, s);
        while !seen[i] {
            seen[i] = true;
            i = piv[i];
            len += 1;
        }
        if len > 0 && len % 2 == 0 {
            sign = -sign;
        }
    }
    sign
}

#[test]
fn pattern_from_groups_is_symmetric_with_its_diagonal() {
    let p = SparsePattern::from_groups(5, &[vec![0, 3, 3, 9], vec![1, 2], vec![4]]);
    assert_eq!(p.n, 5);
    for j in 0..5 {
        assert!(p.position(j, j).is_some(), "diagonal {j}");
        let col = &p.row_idx[p.col_ptr[j]..p.col_ptr[j + 1]];
        assert!(col.windows(2).all(|w| w[0] < w[1]), "column {j} sorted and duplicate-free");
        for &i in col {
            assert!(p.position(j, i).is_some(), "({i}, {j}) has its mirror");
        }
    }
    assert!(p.position(0, 3).is_some() && p.position(1, 2).is_some());
    assert!(p.position(0, 1).is_none() && p.position(3, 4).is_none() && p.position(9, 0).is_none());
    // 5 diagonals, (0,3), (3,0), (1,2), (2,1).
    assert_eq!(p.nnz(), 9);
    let empty = SparsePattern::from_groups(0, &[]);
    assert_eq!(empty.nnz(), 0);
}

#[test]
fn ldlt_solves_positive_definite_systems_and_reports_their_inertia() {
    for a in [laplacian(30, 30, 1, 0.01), random(400, 3, true, 8.0, 7)] {
        let n = a.pattern.n;
        let sym = Rc::new(ldlt_symbolic(&a.pattern));
        let f = ldlt_numeric(&sym, &a, 1e-14).unwrap();
        let b = rhs(n, 3);
        assert!(rel_residual(&a, &f.solve(&b), &b) < 1e-12);
        assert_eq!(f.inertia(), (0, 0, n));
    }
}

#[test]
fn ldlt_solves_indefinite_systems_and_counts_their_negative_eigenvalues() {
    for (a, label) in [(laplacian(7, 6, 1, -1.3), "shifted Laplacian"), (random(50, 3, true, 0.3, 11), "random symmetric")] {
        let n = a.pattern.n;
        let sym = Rc::new(ldlt_symbolic(&a.pattern));
        let f = ldlt_numeric(&sym, &a, 1e-14).unwrap();
        let b = rhs(n, 5);
        let x = f.solve(&b);
        let xd = dense_solve(&a, &b);
        let scale = xd.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        for (s, d) in x.iter().zip(&xd) {
            assert!((s - d).abs() < 1e-10 * scale, "{label}: {s} vs dense {d}");
        }
        let eig = jacobi_eigen(&a.to_dense(), n, 200);
        let neg = eig.values.iter().filter(|&&v| v < 0.0).count();
        assert!(neg > 0 && neg < n, "{label} is indefinite");
        assert_eq!(f.inertia(), (neg, 0, n - neg), "{label}");
    }
}

#[test]
fn ldlt_refuses_a_zero_pivot_and_lu_solves_it() {
    // [[0, 1], [1, 0]] plus an SPD block: no pivot in the natural order.
    let p = Rc::new(SparsePattern::from_groups(3, &[vec![0, 1], vec![2]]));
    let mut a = SparseMatrix::zeros(Rc::clone(&p));
    a.values[p.position(0, 1).unwrap()] = 1.0;
    a.values[p.position(1, 0).unwrap()] = 1.0;
    a.values[p.position(2, 2).unwrap()] = 2.0;
    let sym = Rc::new(ldlt_symbolic_with_perm(&p, &[0, 1, 2]));
    assert!(matches!(ldlt_numeric(&sym, &a, 1e-14), Err(LdltError::TinyPivot { column: 0, .. })));

    let lu = lu_numeric(&a, &[0, 1, 2], 1.0).unwrap();
    let b = [3.0, 5.0, 4.0];
    let x = lu.solve(&b);
    assert_eq!(x, vec![5.0, 3.0, 2.0]);
    assert_eq!(lu.det_sign(), -1);
}

#[test]
fn lu_solves_nonsymmetric_systems_and_knows_the_determinant_sign() {
    for seed in [1, 2, 3, 4, 5, 6] {
        for diag in [0.0, 0.5, 4.0] {
            let a = random(60, 3, false, diag, seed);
            let n = a.pattern.n;
            let sym = ldlt_symbolic(&a.pattern);
            let lu = match lu_numeric(&a, &sym.perm, 0.1) {
                Ok(lu) => lu,
                Err(e) => panic!("seed {seed}, diag {diag}: {e}"),
            };
            let b = rhs(n, seed + 100);
            assert!(rel_residual(&a, &lu.solve(&b), &b) < 1e-12, "seed {seed}, diag {diag}");
            assert_eq!(lu.det_sign(), dense_det_sign(&a), "seed {seed}, diag {diag}");
        }
    }
}

#[test]
fn one_symbolic_factorization_serves_every_matrix_on_its_pattern() {
    let a1 = laplacian(12, 9, 1, 0.5);
    let mut a2 = a1.clone();
    for (k, v) in a2.values.iter_mut().enumerate() {
        *v *= 1.0 + 0.01 * (k % 7) as f64;
    }
    // Make a2 symmetric again: average with the mirror.
    let p = Rc::clone(&a2.pattern);
    let mirror: Vec<f64> = (0..p.n)
        .flat_map(|j| (p.col_ptr[j]..p.col_ptr[j + 1]).map(move |q| (j, q)))
        .map(|(j, q)| a2.values[p.position(j, p.row_idx[q]).unwrap()])
        .collect();
    for (v, m) in a2.values.iter_mut().zip(mirror) {
        *v = 0.5 * (*v + m);
    }
    assert!(a2.is_symmetric(1e-15));
    let sym = Rc::new(ldlt_symbolic(&a1.pattern));
    let b = rhs(a1.pattern.n, 9);
    for a in [&a1, &a2] {
        let f = ldlt_numeric(&sym, a, 1e-14).unwrap();
        assert!(rel_residual(a, &f.solve(&b), &b) < 1e-12);
    }
}

/// Sizes of the engine's models, in a debug build: a 20k-unknown plane
/// grid and a 4k-unknown cube, whose fill is far heavier per unknown. (In
/// release the 20k-unknown cube takes about 0.8 s for LDLᵀ and 4 s for LU.)
#[test]
fn twenty_thousand_unknowns_factor_and_solve() {
    for a in [laplacian(141, 141, 1, 0.01), laplacian(16, 16, 16, 0.01)] {
        let n = a.pattern.n;
        let b = rhs(n, 1);
        let t = Instant::now();
        let sym = Rc::new(ldlt_symbolic(&a.pattern));
        let f = ldlt_numeric(&sym, &a, 1e-14).unwrap();
        let x = f.solve(&b);
        let ldlt_time = t.elapsed();
        assert!(rel_residual(&a, &x, &b) < 1e-10);
        assert_eq!(f.inertia(), (0, 0, n));
        let t = Instant::now();
        let lu = lu_numeric(&a, &sym.perm, 0.1).unwrap();
        let y = lu.solve(&b);
        let lu_time = t.elapsed();
        assert!(rel_residual(&a, &y, &b) < 1e-10);
        eprintln!("n = {n}, nnz(L) = {}: LDLᵀ {ldlt_time:?}, LU {lu_time:?}", sym.l_nnz());
    }
}

#[test]
fn factorizations_are_deterministic() {
    let a = random(300, 4, true, 1.0, 21);
    let b = rhs(300, 22);
    let solve_ldlt = || {
        let sym = Rc::new(ldlt_symbolic(&a.pattern));
        ldlt_numeric(&sym, &a, 1e-14).unwrap().solve(&b)
    };
    let solve_lu = || {
        let sym = ldlt_symbolic(&a.pattern);
        lu_numeric(&a, &sym.perm, 0.1).unwrap().solve(&b)
    };
    let (x1, x2) = (solve_ldlt(), solve_ldlt());
    assert!(x1.iter().zip(&x2).all(|(p, q)| p.to_bits() == q.to_bits()));
    let (y1, y2) = (solve_lu(), solve_lu());
    assert!(y1.iter().zip(&y2).all(|(p, q)| p.to_bits() == q.to_bits()));
}

#[test]
fn empty_and_one_by_one() {
    let p0 = Rc::new(SparsePattern::from_groups(0, &[]));
    let a0 = SparseMatrix::zeros(Rc::clone(&p0));
    let s0 = Rc::new(ldlt_symbolic(&p0));
    assert_eq!(ldlt_numeric(&s0, &a0, 1e-14).unwrap().solve(&[]), Vec::<f64>::new());
    assert_eq!(lu_numeric(&a0, &[], 1.0).unwrap().solve(&[]), Vec::<f64>::new());

    let p1 = Rc::new(SparsePattern::from_groups(1, &[]));
    let mut a1 = SparseMatrix::zeros(Rc::clone(&p1));
    a1.values[0] = -4.0;
    let s1 = Rc::new(ldlt_symbolic(&p1));
    let f = ldlt_numeric(&s1, &a1, 1e-14).unwrap();
    assert_eq!(f.solve(&[2.0]), vec![-0.5]);
    assert_eq!(f.inertia(), (1, 0, 0));
    let lu = lu_numeric(&a1, &[0], 1.0).unwrap();
    assert_eq!(lu.solve(&[2.0]), vec![-0.5]);
    assert_eq!(lu.det_sign(), -1);
}

/// Timings of LDLᵀ on 3D grids (print with `--nocapture`; release for real
/// numbers). The 20k-unknown cube runs only in release.
#[test]
fn ldlt_timings_on_3d_grids() {
    let grids: &[(usize, usize, usize)] = if cfg!(debug_assertions) { &[(12, 12, 12)] } else { &[(20, 20, 20), (28, 28, 26)] };
    for &(nx, ny, nz) in grids {
        let a = laplacian(nx, ny, nz, 0.01);
        let n = a.pattern.n;
        let b = rhs(n, 3);
        let t = Instant::now();
        let sym = Rc::new(ldlt_symbolic(&a.pattern));
        let t_sym = t.elapsed();
        // Best of three: timings on a shared machine are noisy.
        let mut t_num = std::time::Duration::MAX;
        let mut t_simp = std::time::Duration::MAX;
        let mut f = None;
        for _ in 0..3 {
            let t = Instant::now();
            f = Some(ldlt_numeric(&sym, &a, 1e-14).unwrap());
            t_num = t_num.min(t.elapsed());
            let t = Instant::now();
            let _ = ldlt_numeric_simplicial(&sym, &a, 1e-14).unwrap();
            t_simp = t_simp.min(t.elapsed());
        }
        let f = f.unwrap();
        let t = Instant::now();
        let x = f.solve(&b);
        let t_solve = t.elapsed();
        assert!(rel_residual(&a, &x, &b) < 1e-10);
        assert_eq!(f.inertia(), (0, 0, n));
        eprintln!("{nx}×{ny}×{nz} (n = {n}, nnz(L) = {}): symbolic {t_sym:?}, numeric {t_num:?} (simplicial {t_simp:?}), solve {t_solve:?}", sym.l_nnz());
    }
}

/// Supernodal and simplicial agree: same inertia, the same solution to
/// rounding, on plane and cube grids and on random symmetric matrices,
/// definite and indefinite.
#[test]
fn supernodal_and_simplicial_ldlt_agree() {
    let mut cases = vec![laplacian(30, 30, 1, 0.5), laplacian(9, 8, 7, 0.01), laplacian(9, 8, 7, -1.3), laplacian(10, 10, 10, -0.7)];
    for seed in [31, 32, 33] {
        cases.push(random(400, 4, true, 6.0, seed));
        cases.push(random(400, 4, true, 0.3, seed));
    }
    for (k, a) in cases.iter().enumerate() {
        let n = a.pattern.n;
        let sym = Rc::new(ldlt_symbolic(&a.pattern));
        let b = rhs(n, 40 + k as u64);
        let (sup, simp) = match (ldlt_numeric_supernodal(&sym, a, 1e-14), ldlt_numeric_simplicial(&sym, a, 1e-14)) {
            (Ok(x), Ok(y)) => (x, y),
            (Err(LdltError::TinyPivot { column: c1, .. }), Err(LdltError::TinyPivot { column: c2, .. })) => {
                assert_eq!(c1, c2, "case {k}: both refuse, at the same column");
                continue;
            }
            (x, y) => panic!("case {k}: supernodal {:?}, simplicial {:?}", x.err(), y.err()),
        };
        assert_eq!(sup.inertia(), simp.inertia(), "case {k}");
        let (xs, xp) = (sup.solve(&b), simp.solve(&b));
        // Indefinite without pivoting, the residual is the factorization's
        // growth, not the path's: the supernodal one is as small as the
        // simplicial one, and 1e-12 when the matrix is definite.
        let (rs, rp) = (rel_residual(a, &xs, &b), rel_residual(a, &xp, &b));
        let bound = if sup.inertia().0 == 0 { 1e-12 } else { 1e-12f64.max(10.0 * rp) };
        assert!(rs < bound, "case {k}: residual {rs} (simplicial {rp})");
        let scale = xp.iter().fold(0.0f64, |m, v| m.max(v.abs()));
        let diff = xs.iter().zip(&xp).fold(0.0f64, |m, (p, q)| m.max((p - q).abs()));
        assert!(diff <= 1e-10 * scale, "case {k}: solutions differ by {diff} (scale {scale})");
        // Without pivoting an indefinite factorization amplifies rounding
        // differently in each order of operations: pivots agree to 1e-8.
        for (p, q) in sup.pivots().iter().zip(simp.pivots()) {
            assert!((p - q).abs() <= 1e-8 * q.abs().max(1.0), "case {k}: pivots {p} vs {q}");
        }
    }
}

/// The inertia of the supernodal factorization is Sylvester's: the count of
/// negative eigenvalues of an indefinite matrix above the simplicial cutoff.
#[test]
fn supernodal_inertia_counts_negative_eigenvalues() {
    for (shift, seed) in [(-0.9, 0u64), (-2.1, 0), (0.0, 61), (0.0, 62)] {
        let a = if seed == 0 { laplacian(6, 5, 2, shift) } else { random(48, 3, true, 0.2, seed) };
        let n = a.pattern.n;
        assert!(n >= 32);
        let sym = Rc::new(ldlt_symbolic(&a.pattern));
        let f = match ldlt_numeric_supernodal(&sym, &a, 1e-14) {
            Ok(f) => f,
            Err(e) => panic!("shift {shift}, seed {seed}: {e:?}"),
        };
        let eig = jacobi_eigen(&a.to_dense(), n, 200);
        let neg = eig.values.iter().filter(|&&v| v < 0.0).count();
        assert_eq!(f.inertia().0, neg, "shift {shift}, seed {seed}");
    }
}

/// A zero pivot in the given order is refused by the supernodal path as by
/// the simplicial one, at the same column.
#[test]
fn supernodal_refuses_the_same_zero_pivot() {
    // [[0, 1], [1, 0]] at columns 0 and 1, then a 40-unknown chain.
    let n = 42;
    let mut groups = vec![vec![0, 1]];
    for i in 2..n - 1 {
        groups.push(vec![i, i + 1]);
    }
    let p = Rc::new(SparsePattern::from_groups(n, &groups));
    let mut a = SparseMatrix::zeros(Rc::clone(&p));
    a.values[p.position(0, 1).unwrap()] = 1.0;
    a.values[p.position(1, 0).unwrap()] = 1.0;
    for i in 2..n {
        a.values[p.position(i, i).unwrap()] = 2.5;
        if i + 1 < n {
            a.values[p.position(i, i + 1).unwrap()] = -1.0;
            a.values[p.position(i + 1, i).unwrap()] = -1.0;
        }
    }
    let natural: Vec<usize> = (0..n).collect();
    let sym = Rc::new(ldlt_symbolic_with_perm(&p, &natural));
    let s = ldlt_numeric_supernodal(&sym, &a, 1e-14);
    let t = ldlt_numeric_simplicial(&sym, &a, 1e-14);
    assert!(matches!(s, Err(LdltError::TinyPivot { column: 0, .. })), "{:?}", s.err());
    assert!(matches!(t, Err(LdltError::TinyPivot { column: 0, .. })));
    // A NaN pivot is refused too.
    let mut b = a.clone();
    b.values[p.position(0, 0).unwrap()] = f64::NAN;
    assert!(matches!(ldlt_numeric_supernodal(&sym, &b, 1e-14), Err(LdltError::TinyPivot { column: 0, .. })));
}

// ==================== Supervariables ====================

/// An FE-like block matrix: nodes on an nx × ny × nz grid with `dofs` DOFs
/// each (every `partial.0`-th node keeps only `partial.1` of them, as a node
/// with restrained DOFs does), coupled to their 6 face neighbours (a frame)
/// or to all 26 (`box27`, a solid mesh). K = Σ over coupled pairs of
/// [B −B; −B B], plus I on every DOF, minus `shift`·I: B a fixed SPD block.
/// Returns the matrix and each node's DOFs.
fn block_matrix(
    (nx, ny, nz): (usize, usize, usize),
    dofs: usize,
    box27: bool,
    partial: Option<(usize, usize)>,
    shift: f64,
) -> (SparseMatrix, Vec<Vec<usize>>) {
    let id = |i: usize, j: usize, k: usize| (k * ny + j) * nx + i;
    let nodes = nx * ny * nz;
    let mut node_dofs = Vec::with_capacity(nodes);
    let mut next = 0;
    for v in 0..nodes {
        let count = match partial {
            Some((every, keep)) if v % every == every - 1 => keep,
            _ => dofs,
        };
        node_dofs.push((next..next + count).collect::<Vec<usize>>());
        next += count;
    }
    let mut edges = Vec::new();
    for k in 0..nz {
        for j in 0..ny {
            for i in 0..nx {
                for dk in -1i64..=1 {
                    for dj in -1i64..=1 {
                        for di in -1i64..=1 {
                            let face = (di.abs() + dj.abs() + dk.abs()) == 1;
                            if (di, dj, dk) == (0, 0, 0) || (!box27 && !face) {
                                continue;
                            }
                            let (a, b, c) = (i as i64 + di, j as i64 + dj, k as i64 + dk);
                            if a < 0 || b < 0 || c < 0 || a >= nx as i64 || b >= ny as i64 || c >= nz as i64 {
                                continue;
                            }
                            let (p, q) = (id(i, j, k), id(a as usize, b as usize, c as usize));
                            if q > p {
                                edges.push((p, q));
                            }
                        }
                    }
                }
            }
        }
    }
    let mut groups: Vec<Vec<usize>> = node_dofs.clone();
    for &(p, q) in &edges {
        groups.push(node_dofs[p].iter().chain(&node_dofs[q]).copied().collect());
    }
    let pattern = Rc::new(SparsePattern::from_groups(next, &groups));
    let mut a = SparseMatrix::zeros(pattern.clone());
    let block = |r: usize, c: usize| if r == c { 4.0 } else { 1.0 / (1.0 + r.abs_diff(c) as f64) };
    let mut add = |r: usize, c: usize, v: f64| {
        let k = pattern.position(r, c).unwrap();
        a.values[k] += v;
    };
    for &(p, q) in &edges {
        let (dp, dq) = (&node_dofs[p], &node_dofs[q]);
        for (x, &r) in dp.iter().enumerate() {
            for (y, &c) in dp.iter().enumerate() {
                add(r, c, block(x, y));
            }
            for (y, &c) in dq.iter().enumerate() {
                add(r, c, -block(x, y));
                add(c, r, -block(x, y));
            }
        }
        for (x, &r) in dq.iter().enumerate() {
            for (y, &c) in dq.iter().enumerate() {
                add(r, c, block(x, y));
            }
        }
    }
    for d in 0..next {
        add(d, d, 1.0 - shift);
    }
    (a, node_dofs)
}

/// Each node's DOFs are one supervariable, partial nodes included, and no
/// two nodes share one.
#[test]
fn supervariables_are_the_nodes_dofs() {
    for (dofs, box27) in [(3, true), (6, false)] {
        let (a, node_dofs) = block_matrix((5, 4, 3), dofs, box27, Some((5, 3)), 0.0);
        let groups = supervariable_groups(&a.pattern);
        assert_eq!(groups, node_dofs, "{dofs} DOFs per node");
    }
    // A Laplacian has nothing to compress.
    let a = laplacian(6, 5, 4, 0.1);
    assert_eq!(supervariable_groups(&a.pattern).len(), a.pattern.n);
}

/// The compressed ordering gives supernodes at least a node wide and no
/// more fill than plain AMD (within 10 %), and the factorization is the
/// same: residuals, and inertia against simplicial on plain AMD, definite
/// and indefinite.
#[test]
fn compressed_ordering_widens_supernodes_and_factors_the_same() {
    for (dofs, box27) in [(3, true), (6, false)] {
        for shift in [0.0, 2.5] {
            let (a, _) = block_matrix((6, 6, 5), dofs, box27, Some((7, 3)), shift);
            let n = a.pattern.n;
            let sym = Rc::new(ldlt_symbolic(&a.pattern));
            let plain = Rc::new(ldlt_symbolic_plain(&a.pattern));
            let width = n as f64 / sym.supernode_count() as f64;
            let width_plain = n as f64 / plain.supernode_count() as f64;
            // At least a node (some keep 3 DOFs), never narrower than plain AMD.
            assert!(width >= 3.0 && width >= width_plain, "{dofs} DOFs: mean width {width} (plain AMD {width_plain})");
            assert!(sym.l_nnz() as f64 <= 1.1 * plain.l_nnz() as f64);
            let b = rhs(n, 7);
            let f = ldlt_numeric(&sym, &a, 1e-14).unwrap();
            let reference = ldlt_numeric_simplicial(&plain, &a, 1e-14).unwrap();
            assert_eq!(f.inertia(), reference.inertia(), "{dofs} DOFs, shift {shift}");
            if shift == 0.0 {
                assert_eq!(f.inertia(), (0, 0, n));
            } else {
                assert!(f.inertia().0 > 0, "the shift makes it indefinite");
            }
            let x = f.solve(&b);
            let xr = reference.solve(&b);
            assert!(rel_residual(&a, &x, &b) < 1e-10, "{dofs} DOFs, shift {shift}: residual {}", rel_residual(&a, &x, &b));
            let scale = xr.iter().fold(0.0f64, |m, v| m.max(v.abs()));
            assert!(x.iter().zip(&xr).all(|(p, q)| (p - q).abs() <= 1e-8 * scale), "{dofs} DOFs, shift {shift}: solutions differ");
        }
    }
}

/// Plain against compressed AMD on FE-like block matrices of about 20k DOFs
/// (print with `--nocapture`; release for real numbers, where they run;
/// debug runs a small one).
#[test]
fn supervariable_timings_on_block_matrices() {
    let cases: &[((usize, usize, usize), usize, bool)] = if cfg!(debug_assertions) {
        &[((6, 6, 6), 3, true), ((6, 6, 6), 6, false)]
    } else {
        &[((19, 19, 19), 3, true), ((15, 15, 15), 6, false)]
    };
    for &(grid, dofs, box27) in cases {
        let (a, _) = block_matrix(grid, dofs, box27, None, 0.0);
        let n = a.pattern.n;
        let b = rhs(n, 5);
        for (name, compressed) in [("plain AMD", false), ("supervariables", true)] {
            let t = Instant::now();
            let sym = Rc::new(if compressed { ldlt_symbolic(&a.pattern) } else { ldlt_symbolic_plain(&a.pattern) });
            let t_sym = t.elapsed();
            let mut t_num = std::time::Duration::MAX;
            let mut f = None;
            for _ in 0..3 {
                let t = Instant::now();
                f = Some(ldlt_numeric(&sym, &a, 1e-14).unwrap());
                t_num = t_num.min(t.elapsed());
            }
            let f = f.unwrap();
            let x = f.solve(&b);
            assert!(rel_residual(&a, &x, &b) < 1e-10);
            assert_eq!(f.inertia(), (0, 0, n));
            eprintln!(
                "{grid:?}, {dofs} DOFs/node{} (n = {n}), {name}: mean width {:.1}, nnz(L) = {}, symbolic {t_sym:?}, numeric {t_num:?}",
                if box27 { ", 27-node coupling" } else { ", frame coupling" },
                n as f64 / sym.supernode_count() as f64,
                sym.l_nnz()
            );
        }
    }
}
