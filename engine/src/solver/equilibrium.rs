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


pub(super) fn refine_solution(
    mut u: Vec<f64>,
    mut correction: impl FnMut(&[f64]) -> Result<Vec<f64>, String>,
    accepted: impl Fn(&[f64], &[f64]) -> Result<bool, String>,
) -> Result<(Vec<f64>, bool), String> {
    for _ in 0..6 {
        let delta = correction(&u)?;
        super::linear::assert_finite_3d(&u)?;
        super::linear::assert_finite_3d(&delta)?;
        assert_eq!(u.len(), delta.len());
        if accepted(&u, &delta)? {
            return Ok((u, true));
        }
        for (u, delta) in u.iter_mut().zip(delta) {
            *u += delta;
        }
    }
    Ok((u, false))
}

pub(super) fn round_solution(
    u: Vec<f64>,
    round: f64,
    measure: impl Fn(&[f64]) -> Result<f64, String>,
    accepted: impl Fn(f64) -> bool,
    polish: impl Fn(&[f64]) -> Result<Vec<f64>, String>,
) -> Result<Vec<f64>, String> {
    let mut best = u.clone();
    let mut smallest = measure(&best)?;
    for step in 1..=f64::MANTISSA_DIGITS {
        for sign in [-1.0, 1.0] {
            let factor = 1.0
                + sign * (round * f64::from(f64::MANTISSA_DIGITS) + f64::from(step)) * f64::EPSILON;
            let mut candidate: Vec<_> = u.iter().map(|u| u * factor).collect();
            for pass in 0..=2 {
                if pass > 0 {
                    let delta = polish(&candidate)?;
                    for (value, delta) in candidate.iter_mut().zip(delta) {
                        *value += delta;
                    }
                }
                let value = measure(&candidate)?;
                if value.is_finite() && value < smallest {
                    smallest = value;
                    best = candidate.clone();
                    if accepted(value) {
                        return Ok(best);
                    }
                }
            }
        }
    }
    Ok(best)
}
