/// Banded matrix with room for the fill-in of LU with partial pivoting.
pub struct Band {
    n: usize,
    kl: usize,
    ku: usize,
    width: usize,
    a: Vec<f64>,
}

impl Band {
    pub fn new(n: usize, kl: usize, ku: usize) -> Self {
        let width = 2 * kl + ku + 1;
        Band { n, kl, ku, width, a: vec![0.0; n * width] }
    }

    fn at(&self, i: usize, j: usize) -> usize {
        i * self.width + j + self.kl - i
    }

    pub fn in_band(&self, i: usize, j: usize) -> bool {
        j + self.kl >= i && j <= i + self.ku
    }

    pub fn get(&self, i: usize, j: usize) -> f64 {
        if self.in_band(i, j) {
            self.a[self.at(i, j)]
        } else {
            0.0
        }
    }

    pub fn add(&mut self, i: usize, j: usize, v: f64) {
        assert!(self.in_band(i, j), "entry ({i}, {j}) outside the band");
        let k = self.at(i, j);
        self.a[k] += v;
    }

    pub fn set(&mut self, i: usize, j: usize, v: f64) {
        let k = self.at(i, j);
        self.a[k] = v;
    }

    /// Replaces row and column `j` by the identity, moving the known value to the right-hand side.
    pub fn fix(&mut self, j: usize, value: f64, rhs: &mut [f64]) {
        let lo = j.saturating_sub(self.kl.max(self.ku));
        let hi = (j + self.kl.max(self.ku) + 1).min(self.n);
        for i in lo..hi {
            if i != j && self.in_band(i, j) {
                let k = self.at(i, j);
                rhs[i] -= self.a[k] * value;
                self.a[k] = 0.0;
            }
            if i != j && self.in_band(j, i) {
                self.set(j, i, 0.0);
            }
        }
        self.set(j, j, 1.0);
        rhs[j] = value;
    }

    pub fn solve(mut self, b: &mut [f64]) -> Result<(), String> {
        let (n, kl, ku) = (self.n, self.kl, self.ku);
        for k in 0..n {
            let last = (k + kl + 1).min(n);
            let mut p = k;
            for i in k + 1..last {
                if self.get(i, k).abs() > self.get(p, k).abs() {
                    p = i;
                }
            }
            let pivot = self.get(p, k);
            if !pivot.is_finite() || pivot.abs() < 1e-300 {
                return Err(format!("singular tangent at equation {k}"));
            }
            let right = (k + kl + ku + 1).min(n);
            if p != k {
                for j in k..right {
                    let (a, c) = (self.at(k, j), self.at(p, j));
                    self.a.swap(a, c);
                }
                b.swap(k, p);
            }
            for i in k + 1..last {
                let f = self.get(i, k) / pivot;
                if f == 0.0 {
                    continue;
                }
                for j in k + 1..right {
                    let v = self.a[self.at(k, j)];
                    let idx = self.at(i, j);
                    self.a[idx] -= f * v;
                }
                b[i] -= f * b[k];
            }
        }
        for k in (0..n).rev() {
            let right = (k + kl + ku + 1).min(n);
            let mut s = b[k];
            for j in k + 1..right {
                s -= self.a[self.at(k, j)] * b[j];
            }
            b[k] = s / self.a[self.at(k, k)];
        }
        Ok(())
    }
}
