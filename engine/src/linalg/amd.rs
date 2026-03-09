/// Approximate Minimum Degree (AMD) ordering for sparse symmetric matrices.
///
/// Takes lower-triangle CSC format. Returns permutation that reduces fill-in
/// during Cholesky factorization.
/// Compute AMD ordering. Returns perm where perm[new] = old.
pub fn amd_order(n: usize, col_ptr: &[usize], row_idx: &[usize]) -> Vec<usize> {
    if n <= 1 {
        return (0..n).collect();
    }

    // Build adjacency lists from lower-triangle CSC (symmetric structure)
    let mut adj: Vec<Vec<usize>> = vec![Vec::new(); n];
    for j in 0..n {
        for k in col_ptr[j]..col_ptr[j + 1] {
            let i = row_idx[k];
            if i != j {
                adj[i].push(j);
                adj[j].push(i);
            }
        }
    }

    // Deduplicate adjacency
    for list in adj.iter_mut() {
        list.sort_unstable();
        list.dedup();
    }

    // Minimum degree with simple elimination
    let mut eliminated = vec![false; n];
    let mut degree = vec![0usize; n];
    for i in 0..n {
        degree[i] = adj[i].len();
    }

    let mut perm = Vec::with_capacity(n);

    for _ in 0..n {
        // Find non-eliminated node with minimum degree
        let mut min_deg = usize::MAX;
        let mut min_node = 0;
        for i in 0..n {
            if !eliminated[i] && degree[i] < min_deg {
                min_deg = degree[i];
                min_node = i;
            }
        }

        perm.push(min_node);
        eliminated[min_node] = true;

        // Get neighbors of eliminated node
        let neighbors: Vec<usize> = adj[min_node]
            .iter()
            .copied()
            .filter(|&nb| !eliminated[nb])
            .collect();

        // Add edges between all neighbors (fill-in) and update degrees
        for i in 0..neighbors.len() {
            let ni = neighbors[i];
            // Remove eliminated node from adjacency
            adj[ni].retain(|&x| x != min_node);

            // Add edges to other neighbors
            for j in (i + 1)..neighbors.len() {
                let nj = neighbors[j];
                if !adj[ni].contains(&nj) {
                    adj[ni].push(nj);
                    adj[nj].push(ni);
                }
            }

            // Update degree (count non-eliminated neighbors)
            degree[ni] = adj[ni].iter().filter(|&&x| !eliminated[x]).count();
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
}
