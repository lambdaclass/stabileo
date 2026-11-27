use super::sparse::CscMatrix;
use super::sparse_chol::{subtract_columns, NumericCholesky, SymbolicCholesky};
use std::cell::RefCell;
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Clone, Copy)]
struct Factor(*mut f64);
unsafe impl Send for Factor {}
unsafe impl Sync for Factor {}

#[derive(Default)]
struct Workspace {
    panel: Vec<f64>,
    map_pos: Vec<usize>,
    map_gen: Vec<usize>,
    gen: usize,
    pair_k: Vec<usize>,
    pair_j: Vec<usize>,
    runs: Vec<(usize, usize)>,
    sources: Vec<(usize, f64)>,
}

thread_local! {
    static WORKSPACE: RefCell<Workspace> = RefCell::new(Workspace::default());
}

struct Plan<'a> {
    sym: &'a SymbolicCholesky,
    a: &'a CscMatrix,
    l: Factor,
    children: Vec<Vec<usize>>,
    subtree_cost: Vec<f64>,
    grain: f64,
    failed: AtomicBool,
}

impl Plan<'_> {
    fn end(&self, t: usize) -> usize {
        self.sym.snode_start.get(t + 1).copied().unwrap_or(self.sym.n)
    }

    /// The supernodes of the subtree of `t`, descendants before ancestors.
    fn subtree(&self, t: usize) -> Vec<usize> {
        let mut list = vec![t];
        let mut at = 0;
        while at < list.len() {
            list.extend(&self.children[list[at]]);
            at += 1;
        }
        list.sort_unstable();
        list
    }

    fn run(&self, t: usize) {
        if self.failed.load(Ordering::Relaxed) {
            return;
        }
        if self.subtree_cost[t] <= self.grain {
            WORKSPACE.with(|ws| {
                let mut ws = ws.borrow_mut();
                for s in self.subtree(t) {
                    if !self.factor(s, &mut ws) {
                        self.failed.store(true, Ordering::Relaxed);
                        return;
                    }
                }
            });
            return;
        }
        rayon::scope(|scope| {
            for &child in &self.children[t] {
                scope.spawn(move |_| self.run(child));
            }
        });
        if self.failed.load(Ordering::Relaxed) {
            return;
        }
        let ok = WORKSPACE.with(|ws| self.factor(t, &mut ws.borrow_mut()));
        if !ok {
            self.failed.store(true, Ordering::Relaxed);
        }
    }

    /// Factors supernode `t` as `numeric_cholesky` does. Every supernode it reads is a
    /// descendant already factored, and it is the only writer of its own columns.
    fn factor(&self, t: usize, ws: &mut Workspace) -> bool {
        let sym = self.sym;
        let n = sym.n;
        let s = sym.snode_start[t];
        let e = self.end(t);
        let width = e - s;
        let jb = sym.l_col_ptr[s];
        let rows = sym.l_col_ptr[s + 1] - jb;
        if ws.map_pos.len() < n {
            ws.map_pos.resize(n, 0);
            ws.map_gen.resize(n, 0);
        }
        if ws.panel.len() < width * rows {
            ws.panel.resize(width * rows, 0.0);
        }
        ws.gen += 1;
        let gen = ws.gen;
        for p in 0..rows {
            let r = sym.l_row_idx[jb + p];
            ws.map_pos[r] = p;
            ws.map_gen[r] = gen;
        }
        let Workspace { panel, map_pos, map_gen, pair_k, pair_j, runs, sources, .. } = ws;
        let panel = &mut panel[..width * rows];
        panel.fill(0.0);
        for d in 0..width {
            let j = s + d;
            for p in sym.pa_col_ptr[j]..sym.pa_col_ptr[j + 1] {
                panel[d * rows + map_pos[sym.pa_row_idx[p]]] = self.a.values[sym.pa_src[p]];
            }
        }
        for &tk in &sym.snode_upd[t] {
            let ks = sym.snode_start[tk];
            let kw = self.end(tk) - ks;
            let kb = sym.l_col_ptr[ks];
            let krows = sym.l_col_ptr[ks + 1] - kb;
            let k_row = &sym.l_row_idx[kb..kb + krows];
            let k_values = unsafe { std::slice::from_raw_parts(self.l.0.add(kb) as *const f64, sym.l_col_ptr[ks + kw] - kb) };
            let p_lo = k_row.partition_point(|&r| r < s);
            let p_hi = k_row.partition_point(|&r| r < e);
            pair_k.clear();
            pair_j.clear();
            for q in p_lo..krows {
                let r = k_row[q];
                if map_gen[r] == gen {
                    pair_k.push(q);
                    pair_j.push(map_pos[r]);
                }
            }
            runs.clear();
            let mut first = 0;
            for idx in 1..=pair_k.len() {
                if idx == pair_k.len() || pair_k[idx] != pair_k[idx - 1] + 1 || pair_j[idx] != pair_j[idx - 1] + 1 {
                    runs.push((first, idx));
                    first = idx;
                }
            }
            let mut idx0 = 0;
            let mut run0 = 0;
            for pj in p_lo..p_hi {
                let jcol = k_row[pj] - s;
                while idx0 < pair_k.len() && pair_k[idx0] < pj {
                    idx0 += 1;
                }
                sources.clear();
                for d in 0..kw {
                    let col_base = sym.l_col_ptr[ks + d] - d - kb;
                    let u = k_values[col_base + pj];
                    if u != 0.0 {
                        sources.push((col_base, u));
                    }
                }
                while run0 < runs.len() && runs[run0].1 <= idx0 {
                    run0 += 1;
                }
                for &(first, end) in &runs[run0..] {
                    let from = first.max(idx0);
                    let target = &mut panel[jcol * rows + pair_j[from]..][..end - from];
                    subtract_columns(target, k_values, sources, pair_k[from]);
                }
            }
        }
        for d in 0..width {
            let (before, after) = panel.split_at_mut(d * rows);
            sources.clear();
            for k in 0..d {
                let f = before[k * rows + d];
                if f != 0.0 {
                    sources.push((k * rows, f));
                }
            }
            subtract_columns(&mut after[d..rows], before, sources, d);
            let diag = panel[d * rows + d];
            if !(diag > 1e-15) {
                return false;
            }
            let l = diag.sqrt();
            panel[d * rows + d] = l;
            for p in (d + 1)..rows {
                panel[d * rows + p] /= l;
            }
        }
        let own = unsafe { std::slice::from_raw_parts_mut(self.l.0.add(jb), sym.l_col_ptr[e] - jb) };
        for d in 0..width {
            let dst = sym.l_col_ptr[s + d] - jb;
            own[dst..dst + rows - d].copy_from_slice(&panel[d * rows + d..d * rows + rows]);
        }
        true
    }
}

fn finest() -> bool {
    #[cfg(test)]
    return tests::FINEST.with(|finest| finest.get());
    #[cfg(not(test))]
    false
}

/// `numeric_cholesky` with independent subtrees of the supernode tree factored at the same
/// time. Each supernode takes its updates in the order `numeric_cholesky` gives them, so the
/// factor has the same bits whatever the number of threads.
/// The caller has checked that `a` has the pattern `sym` was built for.
pub(super) fn numeric_cholesky_parallel(sym: &Rc<SymbolicCholesky>, a: &CscMatrix) -> Option<NumericCholesky> {
    let n = sym.n;
    let ns = sym.snode_start.len();
    let end = |t: usize| sym.snode_start.get(t + 1).copied().unwrap_or(n);
    let mut snode_of = vec![0usize; n];
    for t in 0..ns {
        snode_of[sym.snode_start[t]..end(t)].fill(t);
    }
    let mut children: Vec<Vec<usize>> = vec![Vec::new(); ns];
    let mut roots = Vec::new();
    let mut subtree_cost: Vec<f64> = (0..ns).map(|t| (sym.snode_start[t]..end(t)).map(|j| ((sym.l_col_ptr[j + 1] - sym.l_col_ptr[j]) as f64).powi(2)).sum()).collect();
    for t in 0..ns {
        let parent = sym.parent[end(t) - 1];
        if parent < 0 {
            roots.push(t);
        } else {
            let p = snode_of[parent as usize];
            children[p].push(t);
            subtree_cost[p] += subtree_cost[t];
        }
    }
    let total: f64 = roots.iter().map(|&t| subtree_cost[t]).sum();
    let mut l_values = vec![0.0f64; sym.l_nnz];
    let plan = Plan {
        sym: &**sym,
        a,
        l: Factor(l_values.as_mut_ptr()),
        children,
        subtree_cost,
        grain: if finest() { 0.0 } else { total / (64.0 * rayon::current_num_threads() as f64) },
        failed: AtomicBool::new(false),
    };
    let plan = &plan;
    rayon::scope(|scope| {
        for &root in &roots {
            scope.spawn(move |_| plan.run(root));
        }
    });
    if plan.failed.load(Ordering::Relaxed) {
        return None;
    }
    Some(NumericCholesky { symbolic: Rc::clone(sym), l_values })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linalg::sparse_chol::{numeric_cholesky, numeric_cholesky_in_order, symbolic_cholesky, PARALLEL_FROM};

    thread_local! {
        pub(super) static FINEST: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
    }

    fn bits(factor: &Option<NumericCholesky>) -> Option<Vec<u64>> {
        factor.as_ref().map(|f| f.l_values.iter().map(|x| x.to_bits()).collect())
    }

    fn in_pool(threads: usize, finest: bool, symbolic: &SymbolicCholesky, a: &CscMatrix) -> Option<Vec<u64>> {
        let pool = rayon::ThreadPoolBuilder::new().num_threads(threads).build().unwrap();
        pool.install(|| {
            FINEST.with(|f| f.set(finest));
            let out = bits(&numeric_cholesky_parallel(&Rc::new(symbolic.clone()), a));
            FINEST.with(|f| f.set(false));
            out
        })
    }

    fn blocks(case: usize, unit: &mut impl FnMut() -> f64) -> CscMatrix {
        let n = 1 + (case * 37) % 420;
        let block = [1usize, 2, 3, 6][case % 4];
        let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
        let mut diagonal = vec![0.0f64; n];
        for j in 0..n {
            let node = j / block;
            for other in [node, node + 1, node + 9, node + 9 * 7] {
                for d in 0..block {
                    let i = other * block + d;
                    if i > j && i < n && unit() < 0.8 {
                        let v = 2.0 * unit() - 1.0;
                        rows.push(i); cols.push(j); vals.push(v);
                        diagonal[i] += v.abs();
                        diagonal[j] += v.abs();
                    }
                }
            }
        }
        for (j, sum) in diagonal.iter().enumerate() {
            rows.push(j); cols.push(j); vals.push(sum * (1.0 + 0.5 * unit()) + 1e-3);
        }
        CscMatrix::from_triplets(n, &rows, &cols, &vals)
    }

    #[test]
    fn the_factor_spread_over_threads_has_the_bits_of_one_supernode_after_another() {
        let mut state = 0x2545F4914F6CDD1Du64;
        let mut unit = || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            (state >> 11) as f64 / (1u64 << 53) as f64
        };
        let (mut compared, mut branching) = (0, 0);
        for case in 0..60 {
            let matrix = blocks(case, &mut unit);
            let symbolic = symbolic_cholesky(&matrix);
            let roots = symbolic.parent.iter().filter(|p| **p < 0).count();
            let mut children = vec![0usize; matrix.n];
            for &p in &symbolic.parent { if p >= 0 { children[p as usize] += 1; } }
            branching += usize::from(roots > 1 || children.iter().any(|c| *c > 1));
            let expected = bits(&numeric_cholesky_in_order(&Rc::new(symbolic.clone()), &matrix));
            assert!(expected.is_some());
            for (threads, finest) in [(1, false), (1, true), (3, false), (3, true)] {
                assert_eq!(in_pool(threads, finest, &symbolic, &matrix), expected, "case {case}, {threads} threads, finest {finest}");
            }
            compared += expected.unwrap().len();
            let mut broken = matrix.clone();
            let column = (case * 13) % matrix.n;
            let at = (broken.col_ptr[column]..broken.col_ptr[column + 1]).find(|&q| broken.row_idx[q] == column).unwrap();
            for value in [-1.0, 0.0, f64::NAN] {
                broken.values[at] = value;
                assert!(numeric_cholesky_in_order(&Rc::new(symbolic.clone()), &broken).is_none());
                for (threads, finest) in [(1, true), (3, false), (3, true)] {
                    assert_eq!(in_pool(threads, finest, &symbolic, &broken), None, "case {case} with {value:?}, {threads} threads, finest {finest}");
                }
            }
        }
        assert!(compared > 200_000 && branching > 30, "{compared} entries compared, {branching} trees with independent subtrees");
    }

    #[test]
    fn a_factor_large_enough_to_be_spread_is_the_one_in_order() {
        let side = 44;
        let block = 6;
        let n = side * side * block;
        let (mut rows, mut cols, mut vals) = (Vec::new(), Vec::new(), Vec::new());
        let mut couple = |a: usize, b: usize| {
            for x in 0..block { for y in 0..block {
                let (i, j) = (a * block + x, b * block + y);
                if i > j { rows.push(i); cols.push(j); vals.push(((i * 31 + j * 17) % 19) as f64 / 19.0 - 0.5); }
            }}
        };
        for i in 0..side { for j in 0..side {
            let node = i * side + j;
            couple(node, node);
            if j + 1 < side { couple(node + 1, node); }
            if i + 1 < side { couple(node + side, node); }
            if i + 1 < side && j + 1 < side { couple(node + side + 1, node); }
        }}
        for d in 0..n { rows.push(d); cols.push(d); vals.push(30.0); }
        let matrix = CscMatrix::from_triplets(n, &rows, &cols, &vals);
        let symbolic = Rc::new(symbolic_cholesky(&matrix));
        assert!(symbolic.l_nnz >= PARALLEL_FROM, "{} entries", symbolic.l_nnz);
        let expected = bits(&numeric_cholesky_in_order(&symbolic, &matrix));
        assert!(expected.is_some());
        assert_eq!(bits(&numeric_cholesky(&symbolic, &matrix)), expected);
        for threads in [1, 2, 5] {
            assert_eq!(in_pool(threads, false, &symbolic, &matrix), expected, "{threads} threads");
        }
        assert_eq!(in_pool(4, true, &symbolic, &matrix), expected);
    }
}
