//! Supervariables: variables with identical structure, ordered as one.
//!
//! A structural model has 3 or 6 DOFs per node, coupled to exactly the same
//! DOFs: their columns of K have the same structure (the diagonal included),
//! and they are "indistinguishable" in the sense of minimum-degree ordering.
//! The engine's AMD (`linalg::amd`) has no supervariable merging, so it
//! orders them one by one and may scatter a node's DOFs; the supernodes then
//! come out about two columns wide. Compressing them first (one vertex per
//! group), ordering the quotient graph, and expanding each group into
//! consecutive positions gives supernodes at least as wide as a node's DOFs,
//! and dense panels the factorization can work on.

use super::pattern::SparsePattern;
use crate::linalg::amd::amd_order;

const NONE: usize = usize::MAX;

/// Indistinguishable variables: `of[j]` is the group of variable `j`;
/// `members[g]` its variables, ascending. Groups are numbered by their first
/// member, so the grouping is deterministic.
pub(crate) struct Supervariables {
    pub of: Vec<usize>,
    pub members: Vec<Vec<usize>>,
}

/// FNV-1a over a column's row indices: a bucket key, confirmed by an exact
/// comparison.
fn column_hash(rows: &[usize]) -> u64 {
    let mut h = 0xcbf2_9ce4_8422_2325u64;
    for &i in rows {
        h ^= i as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

/// Groups the columns with identical structure: O(nnz) hashing, a sort of
/// n keys, and exact comparisons within equal keys.
pub(crate) fn supervariables(p: &SparsePattern) -> Supervariables {
    let n = p.n;
    let col = |j: usize| &p.row_idx[p.col_ptr[j]..p.col_ptr[j + 1]];
    let mut keys: Vec<(usize, u64, usize)> = (0..n).map(|j| (col(j).len(), column_hash(col(j)), j)).collect();
    keys.sort_unstable();
    // root[j]: the smallest variable with j's structure.
    let mut root = vec![NONE; n];
    let mut run_start = 0;
    let mut reps: Vec<usize> = Vec::new();
    for k in 0..n {
        if k > 0 && (keys[k].0, keys[k].1) != (keys[run_start].0, keys[run_start].1) {
            run_start = k;
            reps.clear();
        }
        let j = keys[k].2;
        match reps.iter().find(|&&r| col(r) == col(j)) {
            Some(&r) => root[j] = r,
            None => {
                reps.push(j);
                root[j] = j;
            }
        }
    }
    let mut of = vec![NONE; n];
    let mut members: Vec<Vec<usize>> = Vec::new();
    for j in 0..n {
        // Within a run the keys are sorted by index, so a root is never
        // after the variables it represents.
        if root[j] == j {
            of[j] = members.len();
            members.push(Vec::new());
        } else {
            of[j] = of[root[j]];
        }
        members[of[j]].push(j);
    }
    Supervariables { of, members }
}

/// AMD on the quotient graph, each group expanded into consecutive
/// positions (its members in their original order): `perm[new] = old`.
pub(crate) fn compressed_amd(p: &SparsePattern, sv: &Supervariables) -> Vec<usize> {
    let m = sv.members.len();
    let mut col_ptr = Vec::with_capacity(m + 1);
    let mut row_idx = Vec::new();
    col_ptr.push(0);
    let mut rows = Vec::new();
    for (c, members) in sv.members.iter().enumerate() {
        let j = members[0];
        rows.clear();
        rows.extend(p.row_idx[p.col_ptr[j]..p.col_ptr[j + 1]].iter().map(|&i| sv.of[i]).filter(|&g| g >= c));
        rows.sort_unstable();
        rows.dedup();
        row_idx.extend_from_slice(&rows);
        col_ptr.push(row_idx.len());
    }
    let order = amd_order(m, &col_ptr, &row_idx);
    let mut perm = Vec::with_capacity(p.n);
    for &g in &order {
        perm.extend_from_slice(&sv.members[g]);
    }
    perm
}

/// The groups of indistinguishable variables of a pattern, each ascending,
/// numbered by their first member: for tests and diagnostics.
#[doc(hidden)]
pub fn supervariable_groups(p: &SparsePattern) -> Vec<Vec<usize>> {
    supervariables(p).members
}
