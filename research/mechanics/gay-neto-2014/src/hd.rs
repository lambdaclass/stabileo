use std::ops::{Add, Div, Mul, Neg, Sub};

pub const N: usize = 18;
pub const NH: usize = N * (N + 1) / 2;

const fn pairs() -> ([usize; NH], [usize; NH]) {
    let mut a = [0; NH];
    let mut b = [0; NH];
    let mut k = 0;
    let mut i = 0;
    while i < N {
        let mut j = i;
        while j < N {
            a[k] = i;
            b[k] = j;
            k += 1;
            j += 1;
        }
        i += 1;
    }
    (a, b)
}

const PAIRS: ([usize; NH], [usize; NH]) = pairs();

pub trait Scalar:
    Copy
    + Add<Output = Self>
    + Sub<Output = Self>
    + Mul<Output = Self>
    + Div<Output = Self>
    + Neg<Output = Self>
    + Add<f64, Output = Self>
    + Mul<f64, Output = Self>
{
    fn cst(v: f64) -> Self;
    fn val(&self) -> f64;
    fn sqrt(self) -> Self;
    fn sin(self) -> Self;
    fn cos(self) -> Self;
    fn atan(self) -> Self;
}

impl Scalar for f64 {
    fn cst(v: f64) -> Self {
        v
    }
    fn val(&self) -> f64 {
        *self
    }
    fn sqrt(self) -> Self {
        f64::sqrt(self)
    }
    fn sin(self) -> Self {
        f64::sin(self)
    }
    fn cos(self) -> Self {
        f64::cos(self)
    }
    fn atan(self) -> Self {
        f64::atan(self)
    }
}

/// Value, gradient and upper-triangular Hessian with respect to `N` variables.
#[derive(Clone, Copy)]
pub struct Hd {
    pub v: f64,
    pub g: [f64; N],
    pub h: [f64; NH],
}

impl Hd {
    pub fn var(v: f64, index: usize) -> Self {
        let mut x = Self::cst(v);
        x.g[index] = 1.0;
        x
    }

    pub fn hess(&self, i: usize, j: usize) -> f64 {
        let (i, j) = if i <= j { (i, j) } else { (j, i) };
        self.h[i * N - i * (i + 1) / 2 + j]
    }

    fn chain(self, f0: f64, f1: f64, f2: f64) -> Self {
        let mut r = Self::cst(f0);
        for i in 0..N {
            r.g[i] = f1 * self.g[i];
        }
        for k in 0..NH {
            r.h[k] = f1 * self.h[k] + f2 * self.g[PAIRS.0[k]] * self.g[PAIRS.1[k]];
        }
        r
    }
}

impl Scalar for Hd {
    fn cst(v: f64) -> Self {
        Hd {
            v,
            g: [0.0; N],
            h: [0.0; NH],
        }
    }
    fn val(&self) -> f64 {
        self.v
    }
    fn sqrt(self) -> Self {
        let s = self.v.sqrt();
        self.chain(s, 0.5 / s, -0.25 / (s * self.v))
    }
    fn sin(self) -> Self {
        let (s, c) = self.v.sin_cos();
        self.chain(s, c, -s)
    }
    fn cos(self) -> Self {
        let (s, c) = self.v.sin_cos();
        self.chain(c, -s, -c)
    }
    fn atan(self) -> Self {
        let d = 1.0 / (1.0 + self.v * self.v);
        self.chain(self.v.atan(), d, -2.0 * self.v * d * d)
    }
}

impl Add for Hd {
    type Output = Hd;
    fn add(mut self, b: Hd) -> Hd {
        self.v += b.v;
        for i in 0..N {
            self.g[i] += b.g[i];
        }
        for k in 0..NH {
            self.h[k] += b.h[k];
        }
        self
    }
}

impl Sub for Hd {
    type Output = Hd;
    fn sub(mut self, b: Hd) -> Hd {
        self.v -= b.v;
        for i in 0..N {
            self.g[i] -= b.g[i];
        }
        for k in 0..NH {
            self.h[k] -= b.h[k];
        }
        self
    }
}

impl Neg for Hd {
    type Output = Hd;
    fn neg(self) -> Hd {
        self * -1.0
    }
}

impl Mul for Hd {
    type Output = Hd;
    fn mul(self, b: Hd) -> Hd {
        let mut r = Self::cst(self.v * b.v);
        for i in 0..N {
            r.g[i] = self.v * b.g[i] + b.v * self.g[i];
        }
        for k in 0..NH {
            let (i, j) = (PAIRS.0[k], PAIRS.1[k]);
            r.h[k] = self.v * b.h[k] + b.v * self.h[k] + self.g[i] * b.g[j] + self.g[j] * b.g[i];
        }
        r
    }
}

impl Div for Hd {
    type Output = Hd;
    fn div(self, b: Hd) -> Hd {
        let inv = b.v.recip();
        self * b.chain(inv, -inv * inv, 2.0 * inv * inv * inv)
    }
}

impl Add<f64> for Hd {
    type Output = Hd;
    fn add(mut self, b: f64) -> Hd {
        self.v += b;
        self
    }
}

impl Mul<f64> for Hd {
    type Output = Hd;
    fn mul(mut self, b: f64) -> Hd {
        self.v *= b;
        for i in 0..N {
            self.g[i] *= b;
        }
        for k in 0..NH {
            self.h[k] *= b;
        }
        self
    }
}
