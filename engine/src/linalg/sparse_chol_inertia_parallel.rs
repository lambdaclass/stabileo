use super::sparse::CscMatrix;
use super::sparse_chol::{subtract_scattered, SymbolicCholesky};
use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

struct Shared<T>(*mut T);
impl<T> Clone for Shared<T> {
    fn clone(&self) -> Self { *self }
}
impl<T> Copy for Shared<T> {}
unsafe impl<T> Send for Shared<T> {}
unsafe impl<T> Sync for Shared<T> {}

#[derive(Default)]
struct Workspace {
    x: Vec<f64>,
    mark: Vec<usize>,
    waiting: Vec<usize>,
    sources: Vec<(usize, f64)>,
}

thread_local! {
    static WORKSPACE: RefCell<Workspace> = RefCell::new(Workspace::default());
}

const UNMARKED: usize = usize::MAX;

/// Marks of one factorization are told from those an earlier one left on the same thread.
static MARKS: AtomicUsize = AtomicUsize::new(0);

struct Plan<'a> {
    sym: &'a SymbolicCholesky,
    a: &'a CscMatrix,
    l: Shared<f64>,
    d: Shared<f64>,
    next: Shared<usize>,
    row_ptr: Vec<usize>,
    row_cols: Vec<usize>,
    supernode: Vec<usize>,
    children: Vec<Vec<usize>>,
    subtree_cost: Vec<f64>,
    grain: f64,
    marks: usize,
    negative: AtomicUsize,
    failed: AtomicBool,
    inconsistent: AtomicBool,
}

impl Plan<'_> {
    fn end(&self, t: usize) -> usize {
        self.sym.snode_start.get(t + 1).copied().unwrap_or(self.sym.n)
    }

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

    fn stopped(&self) -> bool {
        self.failed.load(Ordering::Relaxed) || self.inconsistent.load(Ordering::Relaxed)
    }

    fn run(&self, t: usize) {
        if self.stopped() {
            return;
        }
        if self.subtree_cost[t] <= self.grain {
            WORKSPACE.with(|ws| {
                let mut ws = ws.borrow_mut();
                for s in self.subtree(t) {
                    if !self.supernode(s, &mut ws) {
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
        if !self.stopped() {
            WORKSPACE.with(|ws| self.supernode(t, &mut ws.borrow_mut()));
        }
    }

    fn supernode(&self, t: usize, ws: &mut Workspace) -> bool {
        let mut negative = 0;
        for j in self.sym.snode_start[t]..self.end(t) {
            match self.column(j, ws) {
                Some(pivot) => negative += usize::from(pivot < 0.0),
                None => return false,
            }
        }
        self.negative.fetch_add(negative, Ordering::Relaxed);
        true
    }

    /// Column `j` as the count in order computes it: its contributors ascending, those of one
    /// supernode together. They are the columns of the row of `j` in the factor, read off the
    /// elimination tree; all are descendants already finished, and their cursors and the
    /// entries of column `j` are touched by no other thread meanwhile.
    fn column(&self, j: usize, ws: &mut Workspace) -> Option<f64> {
        let sym = self.sym;
        let n = sym.n;
        if ws.x.len() < n {
            ws.x.resize(n, 0.0);
            ws.mark.resize(n, UNMARKED);
        }
        let Workspace { x, mark, waiting, sources } = ws;
        let range = sym.l_col_ptr[j]..sym.l_col_ptr[j + 1];
        for p in range.clone() {
            x[sym.l_row_idx[p]] = 0.0;
        }
        for p in sym.pa_col_ptr[j]..sym.pa_col_ptr[j + 1] {
            x[sym.pa_row_idx[p]] = self.a.values[sym.pa_src[p]];
        }
        waiting.clear();
        let seen = self.marks + j;
        mark[j] = seen;
        for &start in &self.row_cols[self.row_ptr[j]..self.row_ptr[j + 1]] {
            let mut k = start;
            while mark[k] != seen {
                mark[k] = seen;
                waiting.push(k);
                let parent = sym.parent[k];
                if parent < 0 || parent as usize > j {
                    self.inconsistent.store(true, Ordering::Relaxed);
                    return None;
                }
                k = parent as usize;
            }
        }
        waiting.sort_unstable();
        let l = self.l.0;
        let mut scale = x[j].abs();
        let mut at = 0;
        while at < waiting.len() {
            let k = waiting[at];
            let pos = unsafe { *self.next.0.add(k) };
            let end = sym.l_col_ptr[k + 1];
            if pos >= end || sym.l_row_idx[pos] != j {
                self.inconsistent.store(true, Ordering::Relaxed);
                return None;
            }
            sources.clear();
            while sources.len() < 4 && waiting.get(at) == Some(&(k + sources.len())) && self.supernode[k + sources.len()] == self.supernode[k] {
                let column = k + sources.len();
                let entry = unsafe { *self.next.0.add(column) };
                if entry >= sym.l_col_ptr[column + 1] || sym.l_row_idx[entry] != j {
                    self.inconsistent.store(true, Ordering::Relaxed);
                    return None;
                }
                let value = unsafe { *l.add(entry) };
                let factor = unsafe { *self.d.0.add(column) } * value;
                scale += (factor * value).abs();
                sources.push((entry - sym.l_col_ptr[k], factor));
                unsafe { *self.next.0.add(column) = entry + 1 };
                at += 1;
            }
            let last = k + sources.len() - 1;
            let values = unsafe { std::slice::from_raw_parts(l.add(sym.l_col_ptr[k]) as *const f64, sym.l_col_ptr[last + 1] - sym.l_col_ptr[k]) };
            subtract_scattered(x, &sym.l_row_idx[pos..end], values, sources);
        }
        let pivot = x[j];
        if !pivot.is_finite() || pivot.abs() <= 64.0 * f64::EPSILON * scale.max(f64::MIN_POSITIVE) {
            self.failed.store(true, Ordering::Relaxed);
            return None;
        }
        unsafe { *self.d.0.add(j) = pivot };
        let own = unsafe { std::slice::from_raw_parts_mut(l.add(range.start), range.len()) };
        own[0] = 1.0;
        for (value, &row) in own[1..].iter_mut().zip(&sym.l_row_idx[range.start + 1..range.end]) {
            *value = x[row] / pivot;
            if !value.is_finite() {
                self.failed.store(true, Ordering::Relaxed);
                return None;
            }
        }
        Some(pivot)
    }
}

fn finest() -> bool {
    #[cfg(test)]
    return tests::FINEST.with(|finest| finest.get());
    #[cfg(not(test))]
    false
}

pub(super) enum Outcome {
    Factor(usize, Vec<f64>, Vec<f64>),
    Refused,
    /// The elimination tree does not give the rows of the factor: the count in order decides.
    Inconsistent,
}

/// The unpivoted LDLᵀ of the count with independent subtrees of the supernode tree at the same
/// time. The caller has checked that `a` has the pattern `sym` was built for.
pub(super) fn unpivoted_ldl_parallel(sym: &SymbolicCholesky, a: &CscMatrix) -> Outcome {
    let n = sym.n;
    if sym.parent.len() != n || sym.l_col_ptr.len() != n + 1 {
        return Outcome::Inconsistent;
    }
    let ns = sym.snode_start.len();
    let end = |t: usize| sym.snode_start.get(t + 1).copied().unwrap_or(n);
    let mut supernode = vec![0usize; n];
    for t in 0..ns {
        supernode[sym.snode_start[t]..end(t)].fill(t);
    }
    let mut row_ptr = vec![0usize; n + 1];
    for j in 0..n {
        for p in sym.pa_col_ptr[j]..sym.pa_col_ptr[j + 1] {
            let i = sym.pa_row_idx[p];
            if i >= n || i < j {
                return Outcome::Inconsistent;
            }
            if i > j {
                row_ptr[i + 1] += 1;
            }
        }
    }
    for i in 0..n {
        row_ptr[i + 1] += row_ptr[i];
    }
    let mut row_cols = vec![0usize; row_ptr[n]];
    let mut cursor = row_ptr.clone();
    for j in 0..n {
        for p in sym.pa_col_ptr[j]..sym.pa_col_ptr[j + 1] {
            let i = sym.pa_row_idx[p];
            if i > j {
                row_cols[cursor[i]] = j;
                cursor[i] += 1;
            }
        }
    }
    drop(cursor);
    let mut children: Vec<Vec<usize>> = vec![Vec::new(); ns];
    let mut roots = Vec::new();
    let mut subtree_cost: Vec<f64> = (0..ns).map(|t| (sym.snode_start[t]..end(t)).map(|j| ((sym.l_col_ptr[j + 1] - sym.l_col_ptr[j]) as f64).powi(2)).sum()).collect();
    for t in 0..ns {
        let parent = sym.parent[end(t) - 1];
        if parent < 0 {
            roots.push(t);
        } else if (parent as usize) < n && supernode[parent as usize] > t {
            let p = supernode[parent as usize];
            children[p].push(t);
            subtree_cost[p] += subtree_cost[t];
        } else {
            return Outcome::Inconsistent;
        }
    }
    let total: f64 = roots.iter().map(|&t| subtree_cost[t]).sum();
    let mut l = vec![0.0f64; sym.l_nnz];
    let mut d = vec![0.0f64; n];
    let mut next: Vec<usize> = (0..n).map(|k| sym.l_col_ptr[k] + 1).collect();
    let plan = Plan {
        sym,
        a,
        l: Shared(l.as_mut_ptr()),
        d: Shared(d.as_mut_ptr()),
        next: Shared(next.as_mut_ptr()),
        row_ptr,
        row_cols,
        supernode,
        children,
        subtree_cost,
        grain: if finest() { 0.0 } else { total / (64.0 * rayon::current_num_threads() as f64) },
        marks: MARKS.fetch_add(n + 1, Ordering::Relaxed),
        negative: AtomicUsize::new(0),
        failed: AtomicBool::new(false),
        inconsistent: AtomicBool::new(false),
    };
    let plan = &plan;
    rayon::scope(|scope| {
        for &root in &roots {
            scope.spawn(move |_| plan.run(root));
        }
    });
    if plan.inconsistent.load(Ordering::Relaxed) {
        return Outcome::Inconsistent;
    }
    if plan.failed.load(Ordering::Relaxed) {
        return Outcome::Refused;
    }
    if (0..n).any(|k| next[k] != sym.l_col_ptr[k + 1]) {
        return Outcome::Inconsistent;
    }
    Outcome::Factor(plan.negative.load(Ordering::Relaxed), d, l)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::linalg::sparse_chol::{sparse_negative_inertia, symbolic_cholesky, unpivoted_ldl_in_order, INERTIA_PARALLEL_FROM};

    thread_local! {
        pub(super) static FINEST: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
    }

    type Bits = Option<(usize, Vec<u64>, Vec<u64>)>;

    fn bits(values: &[f64]) -> Vec<u64> {
        values.iter().map(|x| x.to_bits()).collect()
    }

    fn in_order(symbolic: &SymbolicCholesky, a: &CscMatrix) -> Bits {
        unpivoted_ldl_in_order(symbolic, a).map(|(negative, d, l)| (negative, bits(&d), bits(&l)))
    }

    fn in_pool(threads: usize, finest: bool, symbolic: &SymbolicCholesky, a: &CscMatrix) -> Bits {
        let pool = rayon::ThreadPoolBuilder::new().num_threads(threads).build().unwrap();
        pool.install(|| {
            FINEST.with(|f| f.set(finest));
            let out = unpivoted_ldl_parallel(symbolic, a);
            FINEST.with(|f| f.set(false));
            match out {
                Outcome::Factor(negative, d, l) => Some((negative, bits(&d), bits(&l))),
                Outcome::Refused => None,
                Outcome::Inconsistent => panic!("the elimination tree of a symbolic factorization gives its rows"),
            }
        })
    }

    fn blocks(case: usize, unit: &mut impl FnMut() -> f64) -> CscMatrix {
        let n = 1 + (case * 37) % 420;
        let block = [1usize, 2, 3, 6, 9][case % 5];
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
        let shift = [0.0, 0.6, 1.0, 1.4][case % 4];
        for (j, sum) in diagonal.iter().enumerate() {
            rows.push(j); cols.push(j); vals.push(sum * (1.0 + 0.5 * unit() - shift) + 1e-3);
        }
        CscMatrix::from_triplets(n, &rows, &cols, &vals)
    }

    #[test]
    fn the_count_spread_over_threads_has_the_pivots_of_one_column_after_another() {
        let mut state = 0x853C49E6748FEA9Bu64;
        let mut unit = || {
            state ^= state << 13;
            state ^= state >> 7;
            state ^= state << 17;
            (state >> 11) as f64 / (1u64 << 53) as f64
        };
        let (mut compared, mut refused, mut negative) = (0, 0, 0);
        for case in 0..80 {
            let matrix = blocks(case, &mut unit);
            let symbolic = symbolic_cholesky(&matrix);
            let expected = in_order(&symbolic, &matrix);
            negative += usize::from(expected.as_ref().is_some_and(|factor| factor.0 > 0));
            compared += expected.as_ref().map_or(0, |factor| factor.2.len());
            for (threads, finest) in [(1, false), (1, true), (3, false), (3, true)] {
                assert_eq!(in_pool(threads, finest, &symbolic, &matrix), expected, "case {case}, {threads} threads, finest {finest}");
            }
            for value in [0.0, f64::NAN, f64::INFINITY, f64::MAX, 1e-300] {
                let mut broken = matrix.clone();
                let column = (case * 13) % matrix.n;
                let at = (broken.col_ptr[column]..broken.col_ptr[column + 1]).find(|&q| broken.row_idx[q] == column).unwrap();
                broken.values[at] = value;
                let expected = in_order(&symbolic, &broken);
                refused += usize::from(expected.is_none());
                for (threads, finest) in [(3, false), (2, true)] {
                    assert_eq!(in_pool(threads, finest, &symbolic, &broken), expected, "case {case} with {value:?}, {threads} threads, finest {finest}");
                }
            }
        }
        assert!(compared > 300_000 && refused > 50 && negative > 20, "{compared} entries compared, {refused} refused, {negative} with negative pivots");
    }

    #[test]
    fn a_count_large_enough_to_be_spread_is_the_one_in_order() {
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
        for d in 0..n { rows.push(d); cols.push(d); vals.push(if d % 7 == 0 { -30.0 } else { 30.0 }); }
        let matrix = CscMatrix::from_triplets(n, &rows, &cols, &vals);
        let symbolic = symbolic_cholesky(&matrix);
        assert!(symbolic.l_nnz >= INERTIA_PARALLEL_FROM, "{} entries", symbolic.l_nnz);
        let expected = in_order(&symbolic, &matrix);
        let count = expected.as_ref().expect("resolved pivots").0;
        assert!(count > 0 && count < n);
        assert_eq!(sparse_negative_inertia(&symbolic, &matrix), Some(count));
        for threads in [1, 2, 5] {
            assert_eq!(in_pool(threads, false, &symbolic, &matrix), expected, "{threads} threads");
        }
        assert_eq!(in_pool(4, true, &symbolic, &matrix), expected);
    }

    #[test]
    fn a_tree_that_does_not_give_the_rows_is_left_to_the_count_in_order() {
        let mut unit = { let mut state = 7u64; move || { state ^= state << 13; state ^= state >> 7; state ^= state << 17; (state >> 11) as f64 / (1u64 << 53) as f64 } };
        let matrix = blocks(7, &mut unit);
        let mut symbolic = symbolic_cholesky(&matrix);
        let moved = (0..matrix.n).find(|&j| symbolic.parent[j] >= 0 && (symbolic.parent[j] as usize) + 1 < matrix.n).unwrap();
        symbolic.parent[moved] += 1;
        assert!(matches!(unpivoted_ldl_parallel(&symbolic, &matrix), Outcome::Inconsistent | Outcome::Factor(..)));
        symbolic.parent[moved] = -1;
        let outcome = unpivoted_ldl_parallel(&symbolic, &matrix);
        assert!(matches!(outcome, Outcome::Inconsistent), "a column cut from its parent leaves rows unvisited");
    }
}
