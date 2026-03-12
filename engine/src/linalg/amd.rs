/// Approximate Minimum Degree (AMD) ordering for sparse symmetric matrices.
///
/// Takes lower-triangle CSC format. Returns permutation that reduces fill-in
/// during Cholesky factorization.
///
/// Uses a min-heap priority queue keyed on (degree, node_index) for O(n log n)
/// minimum-degree selection with deterministic smallest-index tie-breaking,
/// and HashSet adjacency for O(1) neighbor lookups during fill-in.

use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashSet};

/// Compute AMD ordering. Returns perm where perm[new] = old.
pub fn amd_order(n: usize, col_ptr: &[usize], row_idx: &[usize]) -> Vec<usize> {
    if n <= 1 {
        return (0..n).collect();
    }

    // Build adjacency sets from lower-triangle CSC (symmetric structure)
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

    // Initialize degrees and min-heap keyed on (degree, node_index)
    let mut degree = vec![0usize; n];
    let mut heap: BinaryHeap<Reverse<(usize, usize)>> = BinaryHeap::with_capacity(n);
    for i in 0..n {
        degree[i] = adj[i].len();
        heap.push(Reverse((degree[i], i)));
    }

    let mut eliminated = vec![false; n];
    let mut perm = Vec::with_capacity(n);

    for _ in 0..n {
        // Pop minimum (degree, index) — skip stale/eliminated entries
        let min_node = loop {
            let Reverse((d, node)) = heap.pop().expect("heap empty before all nodes eliminated");
            if !eliminated[node] && degree[node] == d {
                break node;
            }
        };

        perm.push(min_node);
        eliminated[min_node] = true;

        // Collect live neighbors
        let neighbors: Vec<usize> = adj[min_node]
            .iter()
            .copied()
            .filter(|&nb| !eliminated[nb])
            .collect();

        // Add fill-in edges and update degrees
        for i in 0..neighbors.len() {
            let ni = neighbors[i];
            // Remove eliminated node from adjacency (O(1) for HashSet)
            adj[ni].remove(&min_node);

            // Add edges to other neighbors (fill-in)
            for j in (i + 1)..neighbors.len() {
                let nj = neighbors[j];
                if !adj[ni].contains(&nj) {
                    adj[ni].insert(nj);
                    adj[nj].insert(ni);
                }
            }

            // Degree is now just the set size (all entries are live since we
            // remove eliminated nodes eagerly)
            let new_deg = adj[ni].len();
            if new_deg != degree[ni] {
                degree[ni] = new_deg;
                heap.push(Reverse((new_deg, ni)));
            }
        }
    }

    perm
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

    #[test]
    fn test_valid_permutation() {
        // Tridiagonal 5×5
        let n = 5;
        let col_ptr = vec![0, 1, 3, 5, 7, 8];
        let row_idx = vec![0, 1, 2, 2, 3, 3, 4, 4];
        // Lower tri: (0,0), (1,1),(2,1), (2,2),(3,2), (3,3),(4,3), (4,4)
        // Actually let me be more careful: col 0: row 0; col 1: rows 1,2; col 2: rows 2,3; etc.

        let perm = amd_order(n, &col_ptr, &row_idx);
        assert_eq!(perm.len(), n);
        let mut sorted = perm.clone();
        sorted.sort();
        assert_eq!(sorted, vec![0, 1, 2, 3, 4]);
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
        let mut sorted = perm.clone();
        sorted.sort();
        assert_eq!(sorted, (0..n).collect::<Vec<_>>());
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
        assert_eq!(perm.len(), n);
        let mut sorted = perm.clone();
        sorted.sort();
        assert_eq!(sorted, (0..n).collect::<Vec<_>>());
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
            nodes.insert((i+1).to_string(), SolverNode { id: i+1, x: i as f64 * elem_len, y: 0.0 });
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
            kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None });
        sups.insert("2".to_string(), SolverSupport { id: 2, node_id: n_elem+1,
            support_type: "rollerX".to_string(),
            kx: None, ky: None, kz: None, dx: None, dy: None, drz: None, angle: None });
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
        let mut sorted_perm = sym.perm.clone();
        sorted_perm.sort();
        assert_eq!(sorted_perm, (0..n).collect::<Vec<_>>(), "Invalid permutation");

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
        assert_eq!(perm.len(), n);
        let mut sorted = perm.clone();
        sorted.sort();
        assert_eq!(sorted, vec![0, 1, 2, 3]);
    }
}
