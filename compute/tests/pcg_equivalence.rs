#[path = "support/pcg_reference.rs"]
mod reference;
use dedaliano_engine::linalg::{
    pcg::{pcg_solve, PcgResult},
    preconditioner::{
        Ic0Preconditioner, IdentityPreconditioner, JacobiPreconditioner, Preconditioner,
    },
    CscMatrix,
};

fn same(actual: PcgResult, expected: PcgResult) {
    assert_eq!(
        actual.x.iter().map(|v| v.to_bits()).collect::<Vec<_>>(),
        expected.x.iter().map(|v| v.to_bits()).collect::<Vec<_>>()
    );
    assert_eq!(actual.iterations, expected.iterations);
    assert_eq!(actual.converged, expected.converged);
    assert_eq!(
        actual.final_rel_residual.to_bits(),
        expected.final_rel_residual.to_bits()
    );
}

#[test]
fn synchronous_pcg_keeps_original_bits_iterations_and_refusals() {
    for n in [1, 3, 17, 65] {
        for diagonal in [0., -2., 2., 4., 1e-200, 1e200] {
            let mut rows = Vec::new();
            let mut cols = Vec::new();
            let mut vals = Vec::new();
            for i in 0..n {
                rows.push(i);
                cols.push(i);
                vals.push(diagonal);
                if i + 1 < n {
                    rows.push(i + 1);
                    cols.push(i);
                    vals.push(-1.);
                }
            }
            let a = CscMatrix::from_triplets(n, &rows, &cols, &vals);
            let mut pre: Vec<Box<dyn Preconditioner>> = vec![Box::new(IdentityPreconditioner)];
            if let Some(p) = JacobiPreconditioner::new(&a) {
                pre.push(Box::new(p));
            }
            if let Some(p) = Ic0Preconditioner::new(&a) {
                pre.push(Box::new(p));
            }
            for scale in [0., 1., 1e-200, 1e200, f64::INFINITY, f64::NAN] {
                let b: Vec<_> = (0..n).map(|i| ((i % 7) as f64 - 2.5) * scale).collect();
                for p in &pre {
                    for (tol, max) in [(1e-8, 0), (1e-8, 1), (1e-6, 7), (1e-12, 300)] {
                        same(
                            pcg_solve(&a, &b, p.as_ref(), tol, max),
                            reference::reference_pcg(&a, &b, p.as_ref(), tol, max),
                        );
                    }
                }
            }
        }
    }
}
