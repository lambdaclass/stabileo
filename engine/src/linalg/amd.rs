/// Approximate Minimum Degree (AMD) ordering for sparse symmetric matrices.
///
/// Takes lower-triangle CSC format. Returns permutation that reduces fill-in
/// during Cholesky factorization.
///
/// Quotient-graph formulation (Amestoy, Davis & Duff, "An Approximate Minimum
/// Degree Ordering Algorithm", 1996; same scheme as CSparse's `cs_amd`):
/// eliminated variables become "elements" whose external adjacency is kept
/// explicitly, so fill edges are never materialized. Degrees are approximate
/// external degrees; elements absorbed into a newly created element are
/// dropped; variables whose live adjacency collapses into the new clique are
/// mass-eliminated without touching the pivot heap.
///
/// Determinism: every scan follows array insertion order and the pivot heap
/// is keyed on (degree, node_index), so ties always resolve to the smallest
/// index. Same input always yields the same permutation.
///
/// Simplifications vs. the full AMD: no supervariable (indistinguishable
/// node) merging and no post-ordering — the caller builds the elimination
/// tree afterwards.
use std::cmp::Reverse;
use std::collections::BinaryHeap;

const NIL: usize = usize::MAX;

/// Compute AMD ordering. Returns perm where perm[new] = old.
pub fn amd_order(n: usize, col_ptr: &[usize], row_idx: &[usize]) -> Vec<usize> {
    if n <= 1 {
        return (0..n).collect();
    }

    // Symmetric adjacency (A + A^T, diagonal removed) in CSC, via counting
    // sort. This is the only graph structure that keeps per-variable lists:
    // the original A-edges of variable i live in ri[cp[i]..cp[i + 1]].
    let mut cp = vec![0usize; n + 1];
    for j in 0..n {
        for &i in &row_idx[col_ptr[j]..col_ptr[j + 1]] {
            if i != j {
                cp[i + 1] += 1;
                cp[j + 1] += 1;
            }
        }
    }
    for j in 0..n {
        cp[j + 1] += cp[j];
    }
    let mut ri = vec![0usize; cp[n]];
    {
        let mut next = cp[..n].to_vec();
        for j in 0..n {
            for &i in &row_idx[col_ptr[j]..col_ptr[j + 1]] {
                if i != j {
                    ri[next[i]] = j;
                    next[i] += 1;
                    ri[next[j]] = i;
                    next[j] += 1;
                }
            }
        }
    }

    // status[i] = -1 while variable i is live, otherwise its position in the
    // elimination order. An eliminated variable i doubles as element id i.
    let mut status = vec![-1i64; n];
    // deg[i]: approximate external degree of live variable i.
    let mut deg: Vec<usize> = (0..n).map(|i| cp[i + 1] - cp[i]).collect();
    let mut elem_alive = vec![false; n];
    let mut ea_start = vec![0usize; n]; // element i's adjacency: ea[start..start+len]
    let mut ea_len = vec![0usize; n];
    let mut elist = vec![NIL; n]; // head of variable i's element list
    let mut in_le = vec![false; n]; // membership marks for the current Lp

    // Append-only arenas. Element adjacencies are written once (contiguous);
    // element lists are intrusive linked lists (deterministic order).
    let mut ea: Vec<usize> = Vec::new();
    let mut el_elem: Vec<usize> = Vec::new();
    let mut el_next: Vec<usize> = Vec::new();

    let mut heap: BinaryHeap<Reverse<(usize, usize)>> = BinaryHeap::with_capacity(n);
    for (i, &d) in deg.iter().enumerate() {
        heap.push(Reverse((d, i)));
    }

    let mut order: Vec<usize> = Vec::with_capacity(n);
    let mut lp: Vec<usize> = Vec::new();

    while order.len() < n {
        // Pivot: live variable with minimum (degree, index).
        let p = loop {
            let Reverse((d, i)) = heap.pop().expect("heap empty before elimination finished");
            if status[i] == -1 && deg[i] == d {
                break i;
            }
        };
        status[p] = order.len() as i64;
        order.push(p);

        // Lp = live external adjacency of the new element: A_p plus the
        // adjacency of every live element adjacent to p (those elements are
        // absorbed into the new element p).
        lp.clear();
        for &v in &ri[cp[p]..cp[p + 1]] {
            if status[v] == -1 && !in_le[v] {
                in_le[v] = true;
                lp.push(v);
            }
        }
        let mut node = elist[p];
        while node != NIL {
            let e = el_elem[node];
            node = el_next[node];
            if !elem_alive[e] {
                continue;
            }
            elem_alive[e] = false;
            for &v in &ea[ea_start[e]..ea_start[e] + ea_len[e]] {
                if status[v] == -1 && !in_le[v] {
                    in_le[v] = true;
                    lp.push(v);
                }
            }
        }
        let le_sz = lp.len();

        // The new element takes p's slot; its adjacency is exactly Lp.
        elem_alive[p] = true;
        ea_start[p] = ea.len();
        ea_len[p] = le_sz;
        ea.extend_from_slice(&lp);

        // Upper bound for the degree of any live variable after this step.
        let cap = (n - order.len()).saturating_sub(1);

        for &i in &lp {
            // Live A_i edges outside Lp.
            let mut a_cnt = 0usize;
            for &v in &ri[cp[i]..cp[i + 1]] {
                if status[v] == -1 && !in_le[v] {
                    a_cnt += 1;
                }
            }
            // Approximate external degree: |A_i \ Lp| + |Lp \ {i}| plus, for
            // each element adjacent to i that survives the absorption test,
            // its live external size outside Lp. Overlaps between A_i and
            // elements, and between distinct elements, are counted twice —
            // that is the approximation.
            let mut d = a_cnt + le_sz - 1;
            let mut any_kept = false;
            let mut node = elist[i];
            while node != NIL {
                let e = el_elem[node];
                node = el_next[node];
                if !elem_alive[e] {
                    continue;
                }
                // Count e's live external variables outside Lp; if there are
                // none, e is absorbed by the new element.
                let mut live_out = 0usize;
                for &v in &ea[ea_start[e]..ea_start[e] + ea_len[e]] {
                    if status[v] == -1 && !in_le[v] {
                        live_out += 1;
                    }
                }
                if live_out == 0 {
                    elem_alive[e] = false;
                } else {
                    d += live_out;
                    any_kept = true;
                }
            }
            if a_cnt == 0 && !any_kept {
                // Mass elimination: i's live adjacency lies inside the clique
                // Lp, so eliminating i right after p adds no fill and needs
                // no heap entry. Element p keeps i as a stale adjacency
                // entry, skipped by later scans via status.
                status[i] = order.len() as i64;
                order.push(i);
            } else {
                // Cap: the new external degree is bounded by the uneliminated
                // count and by (previous degree + |Lp \ {i}|).
                d = d.min(cap).min(deg[i] + le_sz - 1);
                deg[i] = d;
                heap.push(Reverse((d, i)));
                el_elem.push(p);
                el_next.push(elist[i]);
                elist[i] = el_elem.len() - 1;
            }
        }

        for &v in &lp {
            in_le[v] = false;
        }
    }

    debug_assert_eq!(order.len(), n);
    order
}

/// Compute inverse permutation: iperm[old] = new.
pub fn inverse_perm(perm: &[usize]) -> Vec<usize> {
    let n = perm.len();
    let mut iperm = vec![0usize; n];
    for (new, &old) in perm.iter().enumerate() {
        iperm[old] = new;
    }
    iperm
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Exact-fill minimum-degree ordering: the pre-quotient-graph
    /// implementation, kept as the quality reference for the property test.
    /// Output is deterministic (heap keyed on (degree, index)); the HashSet
    /// iteration order only affects internal update order, not the result.
    fn amd_order_reference(n: usize, col_ptr: &[usize], row_idx: &[usize]) -> Vec<usize> {
        use std::collections::HashSet;

        if n <= 1 {
            return (0..n).collect();
        }

        let mut adj: Vec<HashSet<usize>> = vec![HashSet::new(); n];
        for j in 0..n {
            for k in col_ptr[j]..col_ptr[j + 1] {
                let i = row_idx[k];
                if i != j {
                    adj[i].insert(j);
                    adj[j].insert(i);
                }
            }
        }

        let mut degree = vec![0usize; n];
        let mut heap: BinaryHeap<Reverse<(usize, usize)>> = BinaryHeap::with_capacity(n);
        for (i, a) in adj.iter().enumerate() {
            degree[i] = a.len();
            heap.push(Reverse((degree[i], i)));
        }

        let mut eliminated = vec![false; n];
        let mut perm = Vec::with_capacity(n);

        for _ in 0..n {
            let min_node = loop {
                let Reverse((d, node)) =
                    heap.pop().expect("heap empty before all nodes eliminated");
                if !eliminated[node] && degree[node] == d {
                    break node;
                }
            };

            perm.push(min_node);
            eliminated[min_node] = true;

            let neighbors: Vec<usize> = adj[min_node]
                .iter()
                .copied()
                .filter(|&nb| !eliminated[nb])
                .collect();

            for i in 0..neighbors.len() {
                let ni = neighbors[i];
                adj[ni].remove(&min_node);

                for j in (i + 1)..neighbors.len() {
                    let nj = neighbors[j];
                    if !adj[ni].contains(&nj) {
                        adj[ni].insert(nj);
                        adj[nj].insert(ni);
                    }
                }

                let new_deg = adj[ni].len();
                if new_deg != degree[ni] {
                    degree[ni] = new_deg;
                    heap.push(Reverse((new_deg, ni)));
                }
            }
        }

        perm
    }

    fn assert_valid_perm(perm: &[usize], n: usize) {
        assert_eq!(perm.len(), n);
        let mut sorted = perm.to_vec();
        sorted.sort_unstable();
        assert_eq!(sorted, (0..n).collect::<Vec<_>>());
    }

    #[test]
    fn test_valid_permutation() {
        // Tridiagonal 5×5
        let n = 5;
        let col_ptr = vec![0, 1, 3, 5, 7, 8];
        let row_idx = vec![0, 1, 2, 2, 3, 3, 4, 4];
        // Lower tri: (0,0), (1,1),(2,1), (2,2),(3,2), (3,3),(4,3), (4,4)

        let perm = amd_order(n, &col_ptr, &row_idx);
        assert_valid_perm(&perm, n);
    }

    #[test]
    fn test_tridiagonal_near_identity() {
        // For tridiagonal, AMD should produce near-identity (no fill at all)
        let n = 5;
        // Build lower-tri tridiagonal CSC
        let mut col_ptr = vec![0usize];
        let mut row_idx = Vec::new();
        for j in 0..n {
            row_idx.push(j); // diagonal
            if j + 1 < n {
                row_idx.push(j + 1); // sub-diagonal
            }
            col_ptr.push(row_idx.len());
        }
        let perm = amd_order(n, &col_ptr, &row_idx);
        // Verify valid permutation
        assert_valid_perm(&perm, n);
    }

    #[test]
    fn test_arrow_matrix() {
        // Arrow matrix: node 0 connected to all others (dense row/col)
        // AMD should eliminate leaf nodes first, then the hub
        let n = 5;
        // Lower triangle: diag + (i,0) for i>0
        let mut col_ptr = vec![0usize];
        let mut row_idx = Vec::new();
        // col 0: rows 0,1,2,3,4
        row_idx.extend_from_slice(&[0, 1, 2, 3, 4]);
        col_ptr.push(row_idx.len());
        // cols 1..4: just diagonal
        for j in 1..n {
            row_idx.push(j);
            col_ptr.push(row_idx.len());
        }
        let perm = amd_order(n, &col_ptr, &row_idx);
        // Hub node (0) should not be eliminated early — it should be among the last 2
        let hub_pos = perm.iter().position(|&x| x == 0).unwrap();
        assert!(hub_pos >= n - 2, "Hub should be near last, got pos {}", hub_pos);
    }

    #[test]
    fn test_inverse_perm_roundtrip() {
        let perm = vec![2, 0, 3, 1];
        let iperm = inverse_perm(&perm);
        for (new, &old) in perm.iter().enumerate() {
            assert_eq!(iperm[old], new);
        }
    }

    #[test]
    fn test_grid_100_node_mesh() {
        // 10×10 grid: nodes (i,j) with edges to 4-neighbors
        // Tests correctness at moderate scale
        let nx = 10;
        let ny = 10;
        let n = nx * ny; // 100 nodes

        // Build lower-triangle CSC for the grid Laplacian
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        for i in 0..nx {
            for j in 0..ny {
                let node = i * ny + j;
                rows.push(node);
                cols.push(node); // diagonal

                // Right neighbor
                if i + 1 < nx {
                    let nb = (i + 1) * ny + j;
                    if nb > node { rows.push(nb); cols.push(node); }
                    else { rows.push(node); cols.push(nb); }
                }
                // Down neighbor
                if j + 1 < ny {
                    let nb = i * ny + (j + 1);
                    if nb > node { rows.push(nb); cols.push(node); }
                    else { rows.push(node); cols.push(nb); }
                }
            }
        }

        // Sort by column then row for CSC
        let mut triplets: Vec<(usize, usize)> = rows.iter().copied().zip(cols.iter().copied()).collect();
        triplets.sort_by(|a, b| a.1.cmp(&b.1).then(a.0.cmp(&b.0)));
        triplets.dedup();

        let mut col_ptr = vec![0usize; n + 1];
        let mut row_idx = Vec::new();
        let mut cur_col = 0;
        for &(r, c) in &triplets {
            while cur_col < c {
                cur_col += 1;
                col_ptr[cur_col] = row_idx.len();
            }
            row_idx.push(r);
        }
        for c in (cur_col + 1)..=n {
            col_ptr[c] = row_idx.len();
        }

        let perm = amd_order(n, &col_ptr, &row_idx);

        // Valid permutation: length n, all unique, in range 0..n
        assert_valid_perm(&perm, n);
    }

    #[test]
    fn test_tridiagonal_100_cholesky_quality() {
        // Verify AMD ordering produces a factorization that actually solves correctly
        use crate::linalg::sparse::CscMatrix;
        use crate::linalg::sparse_chol::sparse_cholesky_solve_full;

        let n = 100;
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let mut vals = Vec::new();
        for i in 0..n {
            rows.push(i); cols.push(i); vals.push(4.0);
            if i + 1 < n {
                rows.push(i + 1); cols.push(i); vals.push(-1.0);
            }
        }
        let a = CscMatrix::from_triplets(n, &rows, &cols, &vals);
        let b: Vec<f64> = (0..n).map(|i| (i + 1) as f64).collect();
        let x = sparse_cholesky_solve_full(&a, &b).unwrap();

        // Verify A*x ≈ b
        let ax = a.sym_mat_vec(&x);
        let mut max_err = 0.0f64;
        for i in 0..n {
            let err = (ax[i] - b[i]).abs();
            max_err = max_err.max(err);
        }
        assert!(max_err < 1e-8, "Tridiagonal 100: max residual = {:.2e}", max_err);
    }

    #[test]
    fn test_actual_beam_kff() {
        // Reproduce the exact matrix from the failing test:
        // 100-element SS beam assembled via assemble_sparse_2d
        use crate::solver::assembly;
        use crate::solver::dof::DofNumbering;
        use crate::types::*;
        use crate::linalg::{extract_subvec, cholesky_solve};
        use crate::linalg::sparse_chol::sparse_cholesky_solve_full;
        use std::collections::HashMap;

        let n_elem = 100usize;
        let l = 10.0;
        let e = 200_000.0;
        let a_val = 0.01;
        let iz = 1e-4;
        let q = -10.0;
        let elem_len = l / n_elem as f64;

        let mut nodes = HashMap::new();
        for i in 0..=n_elem {
            nodes.insert((i+1).to_string(), SolverNode { id: i+1, x: i as f64 * elem_len, z: 0.0 });
        }
        let mut mats = HashMap::new();
        mats.insert("1".to_string(), SolverMaterial { id: 1, e, nu: 0.3 });
        let mut secs = HashMap::new();
        secs.insert("1".to_string(), SolverSection { id: 1, a: a_val, iz, as_y: None });
        let mut elems = HashMap::new();
        for i in 0..n_elem {
            elems.insert((i+1).to_string(), SolverElement {
                id: i+1, elem_type: "frame".to_string(),
                node_i: i+1, node_j: i+2, material_id: 1, section_id: 1,
                hinge_start: false, hinge_end: false,
            });
        }
        let mut sups = HashMap::new();
        sups.insert("1".to_string(), SolverSupport { id: 1, node_id: 1,
            support_type: "pinned".to_string(),
            kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None });
        sups.insert("2".to_string(), SolverSupport { id: 2, node_id: n_elem+1,
            support_type: "rollerX".to_string(),
            kx: None, ky: None, kz: None, dx: None, dz: None, dry: None, angle: None });
        let mut loads = Vec::new();
        for i in 0..n_elem {
            loads.push(SolverLoad::Distributed(SolverDistributedLoad {
                element_id: i+1, q_i: q, q_j: q, a: None, b: None,
            }));
        }
        let input = SolverInput { nodes, materials: mats, sections: secs,
            elements: elems, supports: sups, loads, constraints: vec![], connectors: HashMap::new() };

        let dof_num = DofNumbering::build_2d(&input);
        let nf = dof_num.n_free;
        let n = dof_num.n_total;

        // Sparse assembly
        let sparse_asm = assembly::assemble_sparse_2d(&input, &dof_num);
        let free_idx: Vec<usize> = (0..nf).collect();
        let f_f = extract_subvec(&sparse_asm.f, &free_idx);

        // Sparse solve
        let u_sparse = sparse_cholesky_solve_full(&sparse_asm.k_ff, &f_f)
            .expect("Sparse Cholesky failed");

        // Verify via norm-based residual: ||Ax-b||/||b|| should be tiny
        let ax = sparse_asm.k_ff.sym_mat_vec(&u_sparse);
        let mut res_sq = 0.0f64;
        let mut b_sq = 0.0f64;
        for i in 0..nf {
            let err = ax[i] - f_f[i];
            res_sq += err * err;
            b_sq += f_f[i] * f_f[i];
        }
        let rel_res = res_sq.sqrt() / b_sq.sqrt().max(1e-30);
        assert!(rel_res < 1e-8,
            "Beam Kff: ||Ax-b||/||b|| = {:.2e}, nf={}", rel_res, nf);

        // Also compare to dense Cholesky
        let dense_asm = assembly::assemble_2d(&input, &dof_num);
        let k_ff_dense = crate::linalg::extract_submatrix(&dense_asm.k, n, &free_idx, &free_idx);
        let f_f_dense = extract_subvec(&dense_asm.f, &free_idx);
        let mut k_work = k_ff_dense.clone();
        let u_dense = cholesky_solve(&mut k_work, &f_f_dense, nf).unwrap();

        let mut max_diff = 0.0f64;
        for i in 0..nf {
            let diff = (u_dense[i] - u_sparse[i]).abs();
            let scale = u_dense[i].abs().max(1e-20);
            max_diff = max_diff.max(diff / scale);
        }
        assert!(max_diff < 1e-3,
            "Beam Kff: dense vs sparse max relative diff = {:.2e}",
            max_diff);
    }

    #[test]
    fn test_beam_stiffness_like_matrix() {
        // Simulates a beam stiffness matrix: 3 DOFs/node, 101 nodes, bandwidth 6
        // This matches the structure from assemble_sparse_2d for a 100-element beam
        use crate::linalg::sparse::CscMatrix;
        use crate::linalg::sparse_chol::{sparse_cholesky_solve_full, symbolic_cholesky};

        // Build a random SPD banded matrix that looks like a beam stiffness
        let n = 297; // ~99 nodes × 3 DOFs (after restraining some)
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let mut vals = Vec::new();

        for i in 0..n {
            // Strong diagonal
            rows.push(i); cols.push(i);
            vals.push(100.0 + (i % 3) as f64 * 50.0);

            // Sub-diagonals within same node (bandwidth 3)
            for d in 1..=2 {
                if i + d < n {
                    rows.push(i + d); cols.push(i);
                    vals.push(-1.0 - 0.1 * d as f64);
                }
            }
            // Cross-node coupling (bandwidth 6)
            for d in 3..=5 {
                if i + d < n {
                    rows.push(i + d); cols.push(i);
                    vals.push(-0.5 + 0.1 * (d % 3) as f64);
                }
            }
        }
        let a = CscMatrix::from_triplets(n, &rows, &cols, &vals);
        let b: Vec<f64> = (0..n).map(|i| (i as f64 + 1.0).sin() * 10.0).collect();

        // Check permutation is valid
        let sym = symbolic_cholesky(&a);
        assert_valid_perm(&sym.perm, n);

        // Check factorization solves correctly
        let x = sparse_cholesky_solve_full(&a, &b).unwrap();
        let ax = a.sym_mat_vec(&x);
        let mut max_rel = 0.0f64;
        for i in 0..n {
            let rel = (ax[i] - b[i]).abs() / b[i].abs().max(1e-10);
            max_rel = max_rel.max(rel);
        }
        assert!(max_rel < 1e-6, "Beam-stiffness matrix: max rel residual = {:.2e}", max_rel);
    }

    #[test]
    fn test_beam_like_banded_300() {
        // Beam-like SPD matrix with bandwidth 6 (like 100 2D frame elements)
        // 3 DOFs per node × 101 nodes = 303 DOFs, but restrain some
        use crate::linalg::sparse::CscMatrix;
        use crate::linalg::sparse_chol::sparse_cholesky_solve_full;

        let n = 300;
        let bandwidth = 6;
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let mut vals = Vec::new();

        // Build a banded SPD matrix
        for i in 0..n {
            rows.push(i); cols.push(i);
            vals.push(10.0 + (i as f64) * 0.01); // strong diagonal
            for d in 1..=bandwidth.min(n - i - 1) {
                let j = i + d;
                if j < n {
                    rows.push(j); cols.push(i);
                    vals.push(-0.5 / (d as f64));
                }
            }
        }
        let a = CscMatrix::from_triplets(n, &rows, &cols, &vals);
        let b: Vec<f64> = (0..n).map(|i| ((i * 3 + 1) as f64).sin()).collect();
        let x = sparse_cholesky_solve_full(&a, &b).unwrap();

        let ax = a.sym_mat_vec(&x);
        let mut max_rel = 0.0f64;
        for i in 0..n {
            let rel = (ax[i] - b[i]).abs() / b[i].abs().max(1e-20);
            max_rel = max_rel.max(rel);
        }
        assert!(max_rel < 1e-6, "Banded 300: max rel residual = {:.2e}", max_rel);
    }

    #[test]
    fn test_disconnected_graph() {
        // Two disconnected components: {0,1} and {2,3}
        let n = 4;
        // Lower tri: (0,0), (1,0), (1,1), (2,2), (3,2), (3,3)
        let col_ptr = vec![0, 2, 3, 5, 6];
        let row_idx = vec![0, 1, 1, 2, 3, 3];

        let perm = amd_order(n, &col_ptr, &row_idx);
        assert_valid_perm(&perm, n);
    }

    #[test]
    fn test_determinism() {
        // Same input must produce byte-identical permutations across calls.
        let (n, col_ptr, row_idx) = build_grid_csc(12, 12);
        let p1 = amd_order(n, &col_ptr, &row_idx);
        let p2 = amd_order(n, &col_ptr, &row_idx);
        assert_eq!(p1, p2);
        assert_valid_perm(&p1, n);
    }

    /// Build lower-triangle CSC (structure) for a 5-point nx×ny grid.
    fn build_grid_csc(nx: usize, ny: usize) -> (usize, Vec<usize>, Vec<usize>) {
        let n = nx * ny;
        let mut triplets: Vec<(usize, usize)> = Vec::new();
        for i in 0..nx {
            for j in 0..ny {
                let node = i * ny + j;
                triplets.push((node, node));
                if i + 1 < nx {
                    triplets.push(((i + 1) * ny + j, node));
                }
                if j + 1 < ny {
                    triplets.push((i * ny + (j + 1), node));
                }
            }
        }
        triplets.sort_unstable();
        triplets.dedup();
        let mut col_ptr = vec![0usize; n + 1];
        for &(_, c) in &triplets {
            col_ptr[c + 1] += 1;
        }
        for c in 0..n {
            col_ptr[c + 1] += col_ptr[c];
        }
        let mut row_idx = Vec::with_capacity(triplets.len());
        for &(r, _) in &triplets {
            row_idx.push(r);
        }
        (n, col_ptr, row_idx)
    }

    /// Triplets (rows, cols, diag-dominant vals) for a 5-point grid Laplacian.
    fn grid_5pt(nx: usize, ny: usize) -> (usize, Vec<usize>, Vec<usize>, Vec<f64>) {
        let n = nx * ny;
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let mut vals = Vec::new();
        for i in 0..nx {
            for j in 0..ny {
                let node = i * ny + j;
                rows.push(node);
                cols.push(node);
                vals.push(4.0);
                if i + 1 < nx {
                    rows.push((i + 1) * ny + j);
                    cols.push(node);
                    vals.push(-1.0);
                }
                if j + 1 < ny {
                    rows.push(i * ny + (j + 1));
                    cols.push(node);
                    vals.push(-1.0);
                }
            }
        }
        (n, rows, cols, vals)
    }

    /// Arrowhead matrix: hub 0 connected to all leaves.
    fn arrow(n: usize) -> (usize, Vec<usize>, Vec<usize>, Vec<f64>) {
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let mut vals = Vec::new();
        for i in 0..n {
            rows.push(i);
            cols.push(i);
            vals.push(n as f64);
            if i > 0 {
                rows.push(i);
                cols.push(0);
                vals.push(-1.0);
            }
        }
        (n, rows, cols, vals)
    }

    /// Banded matrix with the given half-bandwidth.
    fn banded(n: usize, bw: usize) -> (usize, Vec<usize>, Vec<usize>, Vec<f64>) {
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let mut vals = Vec::new();
        for i in 0..n {
            rows.push(i);
            cols.push(i);
            vals.push(2.0 * bw as f64 + 1.0);
            for d in 1..=bw.min(n - i - 1) {
                rows.push(i + d);
                cols.push(i);
                vals.push(-1.0);
            }
        }
        (n, rows, cols, vals)
    }

    /// Random symmetric diagonally-dominant matrix, deterministic per seed.
    fn random_symmetric(
        n: usize,
        prob: f64,
        seed: u64,
    ) -> (usize, Vec<usize>, Vec<usize>, Vec<f64>) {
        use rand::rngs::StdRng;
        use rand::{Rng, SeedableRng};

        let mut rng = StdRng::seed_from_u64(seed);
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        let mut vals = Vec::new();
        let mut diag = vec![1.0f64; n];
        for i in 0..n {
            for j in (i + 1)..n {
                if rng.gen::<f64>() < prob {
                    rows.push(j);
                    cols.push(i);
                    vals.push(-1.0);
                    diag[i] += 1.0;
                    diag[j] += 1.0;
                }
            }
        }
        for i in 0..n {
            rows.push(i);
            cols.push(i);
            vals.push(diag[i]);
        }
        (n, rows, cols, vals)
    }

    /// The quotient-graph AMD must produce a valid permutation whose fill
    /// (nnz of L) is not worse than the exact-degree reference by more than
    /// a few percent.
    fn check_fill_quality(name: &str, n: usize, rows: &[usize], cols: &[usize], vals: &[f64]) {
        use crate::linalg::sparse::CscMatrix;
        use crate::linalg::sparse_chol::{symbolic_cholesky, symbolic_cholesky_with_perm};

        let a = CscMatrix::from_triplets(n, rows, cols, vals);

        let sym_new = symbolic_cholesky(&a);
        assert_valid_perm(&sym_new.perm, n);

        let perm_old = amd_order_reference(n, &a.col_ptr, &a.row_idx);
        assert_valid_perm(&perm_old, n);
        let sym_old = symbolic_cholesky_with_perm(&a, &perm_old);

        let new_nnz = sym_new.l_nnz as f64;
        let old_nnz = sym_old.l_nnz as f64;
        assert!(
            new_nnz <= old_nnz * 1.05 + 4.0,
            "{}: fill regression: new l_nnz={} vs reference l_nnz={}",
            name,
            sym_new.l_nnz,
            sym_old.l_nnz
        );
    }

    #[test]
    fn test_fill_quality_vs_reference() {
        let mut cases = 0;

        // 5-point grids of various sizes and aspect ratios
        for k in 2..=14 {
            let (n, r, c, v) = grid_5pt(k, k);
            check_fill_quality(&format!("grid {}x{}", k, k), n, &r, &c, &v);
            cases += 1;
        }
        for (nx, ny) in [(3, 20), (20, 3), (5, 40), (2, 100)] {
            let (n, r, c, v) = grid_5pt(nx, ny);
            check_fill_quality(&format!("grid {}x{}", nx, ny), n, &r, &c, &v);
            cases += 1;
        }

        // Arrowhead matrices
        for n in [2usize, 5, 17, 60, 199] {
            let (n, r, c, v) = arrow(n);
            check_fill_quality("arrow", n, &r, &c, &v);
            cases += 1;
        }

        // Banded matrices
        for n in [2usize, 10, 50, 100, 200] {
            for bw in [1usize, 2, 5, 20] {
                let (n, r, c, v) = banded(n, bw);
                check_fill_quality(&format!("banded n={} bw={}", n, bw), n, &r, &c, &v);
                cases += 1;
            }
        }

        // Random symmetric diagonally-dominant patterns (2 seeds per combo)
        let mut seed = 0x5eedu64;
        for n in [1usize, 2, 3, 5, 10, 20, 50, 100, 150, 200] {
            for prob in [0.02, 0.05, 0.1, 0.2, 0.4] {
                for _ in 0..2 {
                    seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1);
                    let (n, r, c, v) = random_symmetric(n, prob, seed);
                    check_fill_quality(&format!("random n={} p={}", n, prob), n, &r, &c, &v);
                    cases += 1;
                }
            }
        }

        assert!(cases >= 100, "expected ~100 patterns, got {}", cases);
    }
}
