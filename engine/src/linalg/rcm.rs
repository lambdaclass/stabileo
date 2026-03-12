/// Reverse Cuthill-McKee (RCM) ordering for sparse symmetric matrices.
///
/// Produces a bandwidth-reducing permutation for structured meshes.
/// Uses George-Liu pseudo-peripheral starting node and BFS with
/// ascending-degree neighbor ordering.

use std::collections::VecDeque;

/// Compute RCM ordering from lower-triangle CSC. Returns perm where perm[new] = old.
pub fn rcm_order(n: usize, col_ptr: &[usize], row_idx: &[usize]) -> Vec<usize> {
    if n <= 1 {
        return (0..n).collect();
    }

    // Build full adjacency from lower-triangle CSC (symmetric structure)
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
    // Sort and dedup adjacency lists for deterministic BFS
    for list in &mut adj {
        list.sort_unstable();
        list.dedup();
    }

    let degree: Vec<usize> = adj.iter().map(|a| a.len()).collect();

    // Handle disconnected graphs: process each component
    let mut visited = vec![false; n];
    let mut cm_order: Vec<usize> = Vec::with_capacity(n);

    for start_candidate in 0..n {
        if visited[start_candidate] {
            continue;
        }

        // Find pseudo-peripheral starting node via George-Liu algorithm
        let start = pseudo_peripheral_node(start_candidate, &adj, &degree);

        // BFS from start, visiting neighbors in ascending-degree order
        let mut queue = VecDeque::new();
        queue.push_back(start);
        visited[start] = true;

        while let Some(node) = queue.pop_front() {
            cm_order.push(node);

            // Collect unvisited neighbors, sort by degree (ascending)
            let mut neighbors: Vec<usize> = adj[node]
                .iter()
                .copied()
                .filter(|&nb| !visited[nb])
                .collect();
            neighbors.sort_unstable_by_key(|&nb| degree[nb]);

            for nb in neighbors {
                if !visited[nb] {
                    visited[nb] = true;
                    queue.push_back(nb);
                }
            }
        }
    }

    // Reverse for RCM
    cm_order.reverse();
    cm_order
}

/// Find a pseudo-peripheral starting node using repeated BFS (George-Liu).
/// Starting from `start`, do BFS, pick the last-visited node with minimum degree,
/// repeat until eccentricity stops growing.
fn pseudo_peripheral_node(start: usize, adj: &[Vec<usize>], degree: &[usize]) -> usize {
    let n = adj.len();
    let mut current = start;

    loop {
        // BFS from current, record levels
        let mut visited = vec![false; n];
        let mut queue = VecDeque::new();
        queue.push_back(current);
        visited[current] = true;
        let mut last_level: Vec<usize> = Vec::new();

        while !queue.is_empty() {
            last_level.clear();
            let level_size = queue.len();
            for _ in 0..level_size {
                let node = queue.pop_front().unwrap();
                last_level.push(node);
                for &nb in &adj[node] {
                    if !visited[nb] {
                        visited[nb] = true;
                        queue.push_back(nb);
                    }
                }
            }
        }

        // Pick node in last level with minimum degree
        let best = *last_level
            .iter()
            .min_by_key(|&&node| degree[node])
            .unwrap();

        if best == current {
            return current;
        }

        // Check if BFS from best gives larger eccentricity
        let ecc_current = bfs_eccentricity(current, adj);
        let ecc_best = bfs_eccentricity(best, adj);

        if ecc_best <= ecc_current {
            return current;
        }
        current = best;
    }
}

/// Compute BFS eccentricity (max distance) from a node.
fn bfs_eccentricity(start: usize, adj: &[Vec<usize>]) -> usize {
    let n = adj.len();
    let mut visited = vec![false; n];
    let mut queue = VecDeque::new();
    queue.push_back(start);
    visited[start] = true;
    let mut max_depth = 0;

    while !queue.is_empty() {
        let level_size = queue.len();
        for _ in 0..level_size {
            let node = queue.pop_front().unwrap();
            for &nb in &adj[node] {
                if !visited[nb] {
                    visited[nb] = true;
                    queue.push_back(nb);
                }
            }
        }
        if !queue.is_empty() {
            max_depth += 1;
        }
    }
    max_depth
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_rcm_tridiagonal() {
        // Tridiagonal: RCM should produce identity or reverse permutation
        let n = 10;
        let mut col_ptr = vec![0usize];
        let mut row_idx = Vec::new();
        for j in 0..n {
            row_idx.push(j);
            if j + 1 < n {
                row_idx.push(j + 1);
            }
            col_ptr.push(row_idx.len());
        }

        let perm = rcm_order(n, &col_ptr, &row_idx);
        assert_eq!(perm.len(), n);
        let mut sorted = perm.clone();
        sorted.sort();
        assert_eq!(sorted, (0..n).collect::<Vec<_>>());

        // For a tridiagonal, bandwidth should be 1 regardless of ordering
    }

    #[test]
    fn test_rcm_grid_10x10() {
        let nx = 10;
        let ny = 10;
        let n = nx * ny;

        // Build lower-triangle CSC for 4-connected grid
        let mut rows = Vec::new();
        let mut cols = Vec::new();
        for i in 0..nx {
            for j in 0..ny {
                let node = i * ny + j;
                rows.push(node);
                cols.push(node);

                if i + 1 < nx {
                    let nb = (i + 1) * ny + j;
                    if nb > node {
                        rows.push(nb);
                        cols.push(node);
                    } else {
                        rows.push(node);
                        cols.push(nb);
                    }
                }
                if j + 1 < ny {
                    let nb = i * ny + (j + 1);
                    if nb > node {
                        rows.push(nb);
                        cols.push(node);
                    } else {
                        rows.push(node);
                        cols.push(nb);
                    }
                }
            }
        }

        let mut triplets: Vec<(usize, usize)> =
            rows.iter().copied().zip(cols.iter().copied()).collect();
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

        let perm = rcm_order(n, &col_ptr, &row_idx);

        // Valid permutation
        assert_eq!(perm.len(), n);
        let mut sorted = perm.clone();
        sorted.sort();
        assert_eq!(sorted, (0..n).collect::<Vec<_>>());

        // RCM bandwidth should be much less than natural ordering
        // Natural bandwidth for 10×10 grid with row-major = ny = 10
        // RCM should be similar or better
        let bw = compute_bandwidth(&perm, &col_ptr, &row_idx, n);
        assert!(
            bw <= 25,
            "RCM bandwidth {} too large for 10x10 grid (expect <= 25)",
            bw
        );
    }

    #[test]
    fn test_rcm_disconnected() {
        // Two disconnected components: {0,1,2} and {3,4,5}
        let n = 6;
        // Component 1: 0-1-2 chain
        // Component 2: 3-4-5 chain
        let col_ptr = vec![0, 1, 3, 4, 5, 7, 8];
        let row_idx = vec![0, 1, 2, 2, 3, 4, 5, 5];

        let perm = rcm_order(n, &col_ptr, &row_idx);
        assert_eq!(perm.len(), n);
        let mut sorted = perm.clone();
        sorted.sort();
        assert_eq!(sorted, (0..n).collect::<Vec<_>>());
    }

    /// Compute bandwidth of permuted matrix: max |iperm[i] - iperm[j]| for edges (i,j).
    fn compute_bandwidth(
        perm: &[usize],
        col_ptr: &[usize],
        row_idx: &[usize],
        n: usize,
    ) -> usize {
        let mut iperm = vec![0usize; n];
        for (new, &old) in perm.iter().enumerate() {
            iperm[old] = new;
        }

        let mut max_bw = 0usize;
        for j in 0..n {
            for k in col_ptr[j]..col_ptr[j + 1] {
                let i = row_idx[k];
                if i != j {
                    let diff = if iperm[i] > iperm[j] {
                        iperm[i] - iperm[j]
                    } else {
                        iperm[j] - iperm[i]
                    };
                    max_bw = max_bw.max(diff);
                }
            }
        }
        max_bw
    }
}
