use crate::linalg::CscMatrix;

fn subtract_product(sum: &mut f64, low: &mut f64, a: f64, b: f64) {
    let product = a * b;
    let next = *sum - product;
    *low += if sum.abs() >= product.abs() {
        (*sum - next) - product
    } else {
        (-product - next) + *sum
    };
    *low -= a.mul_add(b, -product);
    *sum = next;
}

pub(super) struct Residual {
    sum: Vec<f64>,
    low: Vec<f64>,
}

impl Residual {
    fn new(f: &[f64]) -> Self {
        Self {
            sum: f.to_vec(),
            low: vec![0.0; f.len()],
        }
    }

    fn subtract_product(&mut self, i: usize, a: f64, b: f64) {
        subtract_product(&mut self.sum[i], &mut self.low[i], a, b);
    }

    pub(super) fn subtract_force(&mut self, i: usize, force: f64) {
        self.subtract_product(i, force, 1.0);
    }

    pub(super) fn finish(self) -> Vec<f64> {
        self.sum
            .into_iter()
            .zip(self.low)
            .map(|(hi, lo)| hi + lo)
            .collect()
    }
}

pub(super) fn dense_balance(k: &[f64], f: &[f64], u: &[f64]) -> Residual {
    let n = f.len();
    let mut residual = Residual::new(f);
    for i in 0..n {
        for (j, value) in u.iter().enumerate() {
            residual.subtract_product(i, k[i * n + j], *value);
        }
    }
    residual
}

pub(super) fn sparse_balance(k: &CscMatrix, f: &[f64], u: &[f64]) -> Residual {
    let mut residual = Residual::new(f);
    for j in 0..k.n {
        for p in k.col_ptr[j]..k.col_ptr[j + 1] {
            let (i, value) = (k.row_idx[p], k.values[p]);
            residual.subtract_product(i, value, u[j]);
            if i != j {
                residual.subtract_product(j, value, u[i]);
            }
        }
    }
    residual
}

pub(super) fn dense_residual(k: &[f64], f: &[f64], u: &[f64]) -> Vec<f64> {
    dense_balance(k, f, u).finish()
}

pub(super) fn sparse_residual(k: &CscMatrix, f: &[f64], u: &[f64]) -> Vec<f64> {
    sparse_balance(k, f, u).finish()
}

pub(super) fn refine(
    mut u: Vec<f64>,
    mut solve: impl FnMut(&[f64]) -> Vec<f64>,
    residual: impl Fn(&[f64]) -> Vec<f64>,
) -> Vec<f64> {
    let norm = |r: &[f64]| r.iter().fold(0.0_f64, |n, r| n.hypot(*r));
    let mut r = residual(&u);
    for _ in 0..2 {
        let before = norm(&r);
        if before == 0.0 || !before.is_finite() {
            break;
        }
        let correction = solve(&r);
        let candidate: Vec<_> = u.iter().zip(correction).map(|(u, d)| u + d).collect();
        let next = residual(&candidate);
        let after = norm(&next);
        if !after.is_finite() || after >= before {
            break;
        }
        u = candidate;
        r = next;
    }
    u
}
