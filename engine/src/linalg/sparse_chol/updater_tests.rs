use super::*;

fn original(sym: &SymbolicCholesky) -> Vec<Vec<usize>> {
    let end = |t: usize| sym.snode_start.get(t + 1).copied().unwrap_or(sym.n);
    let mut node_of = vec![0; sym.n];
    for t in 0..sym.snode_start.len() {
        node_of[sym.snode_start[t]..end(t)].fill(t);
    }
    let mut row_to_cols = vec![Vec::new(); sym.n];
    for k in 0..sym.n {
        for p in sym.l_col_ptr[k]..sym.l_col_ptr[k + 1] {
            let i = sym.l_row_idx[p];
            if i > k {
                row_to_cols[i].push(k);
            }
        }
    }
    let mut seen = vec![usize::MAX; sym.snode_start.len()];
    let mut result = vec![Vec::new(); sym.snode_start.len()];
    for t in 0..sym.snode_start.len() {
        for j in sym.snode_start[t]..end(t) {
            for &k in &row_to_cols[j] {
                let tk = node_of[k];
                if tk != t && seen[tk] != t {
                    seen[tk] = t;
                    result[t].push(tk);
                }
            }
        }
    }
    result
}

fn check(a: &CscMatrix, perm: &[usize]) {
    let mut sym = symbolic_cholesky_with_perm(a, perm);
    let expected = original(&sym);
    assert_eq!(sym.snode_upd, expected, "updater order changed");
    let actual = numeric_cholesky(&Rc::new(sym.clone()), a);
    sym.snode_upd = expected;
    let expected = numeric_cholesky(&Rc::new(sym), a);
    match (actual, expected) {
        (Some(a), Some(b)) => assert_eq!(
            a.l_values.iter().map(|x| x.to_bits()).collect::<Vec<_>>(),
            b.l_values.iter().map(|x| x.to_bits()).collect::<Vec<_>>()
        ),
        (None, None) => {}
        _ => panic!("factor acceptance changed"),
    }
}

#[test]
fn every_small_graph_preserves_updater_order() {
    for n in 0usize..=6 {
        let edges = n * n.saturating_sub(1) / 2;
        for mask in 0..(1u64 << edges) {
            let (mut cols, mut rows, mut values, mut edge) = (vec![0], Vec::new(), Vec::new(), 0);
            for j in 0..n {
                rows.push(j);
                values.push(n as f64 + 1.0);
                for i in j + 1..n {
                    if mask & (1 << edge) != 0 {
                        rows.push(i);
                        values.push(-0.25);
                    }
                    edge += 1;
                }
                cols.push(rows.len());
            }
            let a = CscMatrix {
                n,
                col_ptr: cols,
                row_idx: rows,
                values,
            };
            check(&a, &(0..n).collect::<Vec<_>>());
            check(&a, &(0..n).rev().collect::<Vec<_>>());
        }
    }
}

#[test]
fn larger_patterns_and_orderings_preserve_updater_order() {
    for n in [8, 32, 96, 192] {
        for seed in 1..=16 {
            for family in 0..4 {
                let mut state = seed as u64;
                let (mut cols, mut rows, mut values) = (vec![0], Vec::new(), Vec::new());
                for j in 0..n {
                    for i in j..n {
                        state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
                        if i == j
                            || match family {
                                0 => state >> 56 < 16,
                                1 => i / 6 <= j / 6 + 1,
                                2 => i / 12 == j / 12,
                                _ => i - j == 1 || i - j == 8,
                            }
                        {
                            rows.push(i);
                            values.push(if i == j { n as f64 + 1.0 } else { -0.25 });
                        }
                    }
                    cols.push(rows.len());
                }
                let a = CscMatrix {
                    n,
                    col_ptr: cols,
                    row_idx: rows,
                    values,
                };
                check(&a, &(0..n).collect::<Vec<_>>());
                check(&a, &amd_order(n, &a.col_ptr, &a.row_idx));
                check(&a, &rcm_order(n, &a.col_ptr, &a.row_idx));
            }
        }
    }
}

#[test]
fn fixtures_preserve_updater_order_and_report_storage() {
    use crate::solver::{assembly, dof::DofNumbering};
    use crate::types::SolverInput3D;
    for (name, json) in [
        (
            "nave",
            include_str!("../../../tests/fixtures/ex-3d-nave-industrial-input.json"),
        ),
        (
            "tower",
            include_str!("../../../tests/fixtures/ex-3d-tower-input.json"),
        ),
        (
            "building",
            include_str!("../../../tests/fixtures/ex-3d-building-case1-input.json"),
        ),
    ] {
        let input: SolverInput3D = serde_json::from_str(json).unwrap();
        let dofs = DofNumbering::build_3d(&input);
        let a = assembly::assemble_sparse_3d(&input, &dofs, false).k_ff;
        let perm = amd_order(a.n, &a.col_ptr, &a.row_idx);
        check(&a, &perm);
        let sym = symbolic_cholesky_with_perm(&a, &perm);
        let old = sym.l_nnz - sym.n;
        let new: usize = sym
            .snode_start
            .iter()
            .enumerate()
            .map(|(t, &ks)| {
                let end = sym.snode_start.get(t + 1).copied().unwrap_or(sym.n);
                sym.l_col_ptr[ks + 1] - sym.l_col_ptr[ks] - (end - ks)
            })
            .sum();
        eprintln!("{name}: adjacency entries {old} -> {new}");
        assert!(new <= old);
    }
}
