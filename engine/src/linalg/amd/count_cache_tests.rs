use super::*;

fn compare(n: usize, cols: &[usize], rows: &[usize]) {
    // A zero budget executes the original full scan at every visit. All pivot,
    // absorption and mass-elimination decisions must match, not just factor quality.
    let original = amd_order_with_budget(n, cols, rows, 0);
    assert_eq!(amd_order(n, cols, rows), original);
    let bytes = n * std::mem::size_of::<(usize, usize)>();
    assert_eq!(amd_order_with_budget(n, cols, rows, bytes), original);
    if bytes > 0 {
        assert_eq!(amd_order_with_budget(n, cols, rows, bytes - 1), original);
    }
}

#[test]
fn every_small_graph_keeps_the_uncached_permutation() {
    for n in 0usize..=6 {
        let edges = n * n.saturating_sub(1) / 2;
        for mask in 0..(1u64 << edges) {
            let (mut cols, mut rows, mut edge) = (vec![0], Vec::new(), 0);
            for j in 0..n {
                rows.push(j);
                for i in j + 1..n {
                    if mask & (1 << edge) != 0 {
                        rows.push(i);
                    }
                    edge += 1;
                }
                cols.push(rows.len());
            }
            compare(n, &cols, &rows);
        }
    }
}

#[test]
fn random_dense_banded_disconnected_and_grid_graphs_keep_the_permutation() {
    for n in [8, 20, 64, 128, 256] {
        for seed in 0..40u64 {
            for family in 0..6 {
                let mut state = seed + 1;
                let (mut cols, mut rows) = (vec![0], Vec::new());
                for j in 0..n {
                    for i in j..n {
                        state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
                        let keep = i == j
                            || match family {
                                0 => state >> 56 < 12,
                                1 => state >> 56 < 128,
                                2 => i - j < 4,
                                3 => j == 0 || i - j == 1,
                                4 => i / 8 == j / 8,
                                _ => i - j == 1 || i - j == 8,
                            };
                        if keep {
                            rows.push(i);
                        }
                    }
                    cols.push(rows.len());
                }
                compare(n, &cols, &rows);
            }
        }
    }
}

#[test]
fn cache_budget_is_checked_before_allocation_without_wrapping() {
    let slot = std::mem::size_of::<(usize, usize)>();
    assert!(count_cache_fits(0, 0));
    assert!(!count_cache_fits(1, slot - 1));
    assert!(count_cache_fits(1, slot));
    assert!(count_cache_fits(
        MAX_COUNT_CACHE_BYTES / slot,
        MAX_COUNT_CACHE_BYTES
    ));
    assert!(!count_cache_fits(
        MAX_COUNT_CACHE_BYTES / slot + 1,
        MAX_COUNT_CACHE_BYTES
    ));
    assert!(!count_cache_fits(usize::MAX, usize::MAX));
}
