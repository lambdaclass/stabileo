use crate::hd::Scalar;

pub type V3<T> = [T; 3];

#[derive(Clone, Copy, Debug)]
pub struct Quat<T> {
    pub w: T,
    pub v: V3<T>,
}

pub fn dot<T: Scalar>(a: V3<T>, b: V3<T>) -> T {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

pub fn cross<T: Scalar>(a: V3<T>, b: V3<T>) -> V3<T> {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

pub fn scale<T: Scalar>(a: V3<T>, s: T) -> V3<T> {
    [a[0] * s, a[1] * s, a[2] * s]
}

pub fn add<T: Scalar>(a: V3<T>, b: V3<T>) -> V3<T> {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

pub fn sub<T: Scalar>(a: V3<T>, b: V3<T>) -> V3<T> {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

pub fn lift<T: Scalar>(a: V3<f64>) -> V3<T> {
    [T::cst(a[0]), T::cst(a[1]), T::cst(a[2])]
}

impl<T: Scalar> Quat<T> {
    pub fn identity() -> Self {
        Quat {
            w: T::cst(1.0),
            v: [T::cst(0.0); 3],
        }
    }

    pub fn lift(q: Quat<f64>) -> Self {
        Quat {
            w: T::cst(q.w),
            v: lift(q.v),
        }
    }

    pub fn conj(self) -> Self {
        Quat {
            w: self.w,
            v: [-self.v[0], -self.v[1], -self.v[2]],
        }
    }

    pub fn compose(self, b: Self) -> Self {
        Quat {
            w: self.w * b.w - dot(self.v, b.v),
            v: add(
                add(scale(b.v, self.w), scale(self.v, b.w)),
                cross(self.v, b.v),
            ),
        }
    }

    pub fn matrix(self) -> [[T; 3]; 3] {
        let (w, x, y, z) = (self.w, self.v[0], self.v[1], self.v[2]);
        let one = T::cst(1.0);
        [
            [
                one - (y * y + z * z) * 2.0,
                (x * y - w * z) * 2.0,
                (x * z + w * y) * 2.0,
            ],
            [
                (x * y + w * z) * 2.0,
                one - (x * x + z * z) * 2.0,
                (y * z - w * x) * 2.0,
            ],
            [
                (x * z - w * y) * 2.0,
                (y * z + w * x) * 2.0,
                one - (x * x + y * y) * 2.0,
            ],
        ]
    }
}

impl Quat<f64> {
    pub fn normalized(self) -> Self {
        let n = (self.w * self.w + dot(self.v, self.v)).sqrt();
        Quat {
            w: self.w / n,
            v: scale(self.v, 1.0 / n),
        }
    }
}

const SMALL: f64 = 1e-6;

fn half_angle_terms<T: Scalar>(s: T) -> (T, T, T) {
    if s.val() < SMALL {
        let c = (s * (1.0 / 384.0) + (-1.0 / 8.0)) * s + 1.0;
        let c = c - s * s * s * (1.0 / 46080.0);
        let d = (s * (1.0 / 3840.0) + (-1.0 / 48.0)) * s + 0.5;
        let d = d - s * s * s * (1.0 / 645120.0);
        let dd = (s * (-1.0 / 215040.0) + (1.0 / 1920.0)) * s + (-1.0 / 48.0);
        (c, d, dd)
    } else {
        let t = s.sqrt();
        let h = t * 0.5;
        let (sh, ch) = (h.sin(), h.cos());
        let d = sh / t;
        let dd = (t * ch - sh * 2.0) / (s * t * 4.0);
        (ch, d, dd)
    }
}

/// Unit quaternion of the rotation vector `phi`.
pub fn exp<T: Scalar>(phi: V3<T>) -> Quat<T> {
    let (c, d, _) = half_angle_terms(dot(phi, phi));
    Quat {
        w: c,
        v: scale(phi, d),
    }
}

/// `exp(phi)` and its derivative along a path with `phi' = dphi`.
pub fn exp_with_rate<T: Scalar>(phi: V3<T>, dphi: V3<T>) -> (Quat<T>, Quat<T>) {
    let s = dot(phi, phi);
    let ds = dot(phi, dphi) * 2.0;
    let (c, d, dd) = half_angle_terms(s);
    let q = Quat {
        w: c,
        v: scale(phi, d),
    };
    let rate = Quat {
        w: -(d * ds) * 0.25,
        v: add(scale(phi, dd * ds), scale(dphi, d)),
    };
    (q, rate)
}

/// Rotation vector of a unit quaternion, taking the short way round.
pub fn log<T: Scalar>(q: Quat<T>) -> V3<T> {
    let q = if q.w.val() < 0.0 {
        Quat {
            w: -q.w,
            v: [-q.v[0], -q.v[1], -q.v[2]],
        }
    } else {
        q
    };
    let s = dot(q.v, q.v);
    let f = if s.val() < SMALL {
        let iw = T::cst(1.0) / q.w;
        let y2 = s * iw * iw;
        (((y2 * (-1.0 / 7.0) + 0.2) * y2 + (-1.0 / 3.0)) * y2 + 1.0) * iw * 2.0
    } else {
        let t = s.sqrt();
        (t / q.w).atan() * 2.0 / t
    };
    scale(q.v, f)
}
