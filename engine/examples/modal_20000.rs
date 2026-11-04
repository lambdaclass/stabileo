// Reproducible sparse modal benchmark: 20,000 scalar DOFs in a grounded
// spring chain with graded support stiffness and unit mass. Build in release
// mode and measure this executable alone (excluding compilation).
use dedaliano_engine::linalg::{sparse::CscMatrix, lanczos::lanczos_generalized_eigen_sparse};
fn main() {
    let n = 20_000;
    let mut rows = Vec::new(); let mut cols = Vec::new(); let mut vals = Vec::new();
    for i in 0..n {
        rows.push(i); cols.push(i); vals.push(2.0 + i as f64 / n as f64);
        if i > 0 { rows.push(i); cols.push(i-1); vals.push(-0.5); }
    }
    let k = CscMatrix::from_triplets(n, &rows, &cols, &vals);
    let ids: Vec<_> = (0..n).collect();
    let m = CscMatrix::from_triplets(n, &ids, &ids, &vec![1.0; n]);
    let start = std::time::Instant::now();
    let r = lanczos_generalized_eigen_sparse(&k, &m, 6, 0.0).unwrap();
    println!("20,000 DOFs, 6 modes: {:?}, eigenvalues {:?}", start.elapsed(), r.values);
}
