use super::*;

fn check(cache: &mut TripletAssemblyCache, n: usize, rows: &[usize], cols: &[usize], vals: &[f64]) {
    let expected = CscMatrix::from_triplets(n, rows, cols, vals);
    let actual = cache.assemble(n, rows, cols, vals);
    assert_eq!(actual.n, expected.n);
    assert_eq!(actual.col_ptr, expected.col_ptr);
    assert_eq!(actual.row_idx, expected.row_idx);
    assert_eq!(actual.values.iter().map(|v| v.to_bits()).collect::<Vec<_>>(), expected.values.iter().map(|v| v.to_bits()).collect::<Vec<_>>());
}

#[test]
fn cached_assembly_preserves_duplicate_order_and_exceptional_values() {
    let mut cache = TripletAssemblyCache::default();
    let mut state = 31u64;
    for n in [1, 3, 16, 65] {
        for count in [0, 1, 7, 32, 128, 1024] {
            let (mut rows, mut cols) = (Vec::new(), Vec::new());
            for _ in 0..count {
                state ^= state << 13;
                state ^= state >> 7;
                state ^= state << 17;
                rows.push(state as usize % n);
                cols.push((state >> 32) as usize % n);
            }
            for values in [
                [1e16, 1.0, -1e16, 1e-300, -0.0, 0.0],
                [f64::MAX, f64::MAX, -f64::MAX, 1.0, -1.0, 0.0],
                [f64::INFINITY, f64::NEG_INFINITY, f64::NAN, -0.0, 1.0, 0.0],
                [f64::from_bits(0x7ff8_0000_0000_0042), f64::from_bits(0xfff8_0000_0000_0043), f64::NAN, 1.0, 0.0, -0.0],
            ] {
                let vals: Vec<_> = (0..count).map(|i| values[i % values.len()]).collect();
                check(&mut cache, n, &rows, &cols, &vals);
                let previous = cache.plan.as_ref().unwrap().sources.as_ptr();
                check(&mut cache, n, &rows, &cols, &vals);
                assert_eq!(previous, cache.plan.as_ref().unwrap().sources.as_ptr());
            }
        }
    }
}

#[test]
fn same_size_pattern_changes_and_reordered_duplicates_rebuild() {
    let mut cache = TripletAssemblyCache::default();
    for (rows, cols) in [
        (vec![0, 1, 1, 1, 2], vec![0, 0, 0, 0, 2]),
        (vec![0, 2, 1, 1, 2], vec![0, 0, 0, 0, 2]),
        (vec![2, 1, 1, 0, 1], vec![2, 0, 0, 0, 0]),
        (vec![0, 0, 0, 0, 2], vec![0, 1, 1, 1, 2]),
    ] {
        check(&mut cache, 3, &rows, &cols, &[1e16, 1.0, -1e16, -0.0, f64::MAX]);
        check(&mut cache, 4, &rows, &cols, &[0.0, 0.0, 0.0, 0.0, 0.0]);
    }
    check(&mut cache, 0, &[], &[], &[]);
}

#[test]
fn plan_budget_uses_checked_arithmetic_and_falls_back() {
    assert!(!plan_fits(usize::MAX, 0));
    assert!(!plan_fits(0, usize::MAX));
    let count = MAX_PLAN_BYTES / (5 * std::mem::size_of::<usize>()) + 1;
    assert!(!plan_fits(1, count));
    let mut cache = TripletAssemblyCache::default();
    check(&mut cache, 1, &[0], &[0], &[1.0]);
    assert!(cache.plan.is_some());
    check(&mut cache, 1, &vec![0; count], &vec![0; count], &vec![1.0; count]);
    assert!(cache.plan.is_none());
    check(&mut cache, 1, &[0], &[0], &[-0.0]);
    assert!(cache.plan.is_some());
}

#[test]
#[should_panic]
fn cached_assembly_keeps_length_guard() {
    TripletAssemblyCache::default().assemble(1, &[0], &[0], &[]);
}
