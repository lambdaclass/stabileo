/// A square band matrix with `w` diagonals on each side, factorised in place by LU without
/// pivoting (the dynamic matrix M/(βΔt²) + (1+α)K_T is symmetric and, at the steps used,
/// positive definite).
pub struct Band {
    pub n: usize,
    pub w: usize,
    data: Vec<f64>,
}

impl Band {
    pub fn new(n: usize, w: usize) -> Self {
        Band { n, w, data: vec![0.0; n * (2 * w + 1)] }
    }

    pub fn clear(&mut self) {
        self.data.iter_mut().for_each(|v| *v = 0.0);
    }

    fn at(&self, i: usize, j: usize) -> usize {
        i * (2 * self.w + 1) + (j + self.w - i)
    }

    pub fn add(&mut self, i: usize, j: usize, v: f64) {
        debug_assert!(i.abs_diff(j) <= self.w);
        let k = self.at(i, j);
        self.data[k] += v;
    }

    /// Factorises and solves in place; the matrix is consumed. `Err` on a vanishing pivot.
    pub fn solve(&mut self, b: &mut [f64]) -> Result<(), String> {
        let (n, w) = (self.n, self.w);
        for k in 0..n {
            let pivot = self.data[self.at(k, k)];
            if pivot.abs() <= 1e-300 || !pivot.is_finite() {
                return Err("singular dynamic matrix".into());
            }
            for i in k + 1..(k + w + 1).min(n) {
                let l = self.data[self.at(i, k)] / pivot;
                if l == 0.0 {
                    continue;
                }
                let li = self.at(i, k);
                self.data[li] = l;
                for j in k + 1..(k + w + 1).min(n) {
                    let kj = self.data[self.at(k, j)];
                    let ij = self.at(i, j);
                    self.data[ij] -= l * kj;
                }
                b[i] -= l * b[k];
            }
        }
        for k in (0..n).rev() {
            let mut s = b[k];
            for j in k + 1..(k + w + 1).min(n) {
                s -= self.data[self.at(k, j)] * b[j];
            }
            b[k] = s / self.data[self.at(k, k)];
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::Band;

    #[test]
    fn solves_a_tridiagonal_system() {
        let n = 6;
        let mut a = Band::new(n, 1);
        for i in 0..n {
            a.add(i, i, 4.0);
            if i + 1 < n {
                a.add(i, i + 1, -1.0);
                a.add(i + 1, i, -1.0);
            }
        }
        let x: Vec<f64> = (0..n).map(|i| i as f64 + 1.0).collect();
        let mut b: Vec<f64> = (0..n).map(|i| 4.0 * x[i] - if i > 0 { x[i - 1] } else { 0.0 } - if i + 1 < n { x[i + 1] } else { 0.0 }).collect();
        a.solve(&mut b).unwrap();
        for (u, v) in b.iter().zip(&x) {
            assert!((u - v).abs() < 1e-12);
        }
    }
}
