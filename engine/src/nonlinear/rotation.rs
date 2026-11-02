//! Finite rotations in 3D.
//!
//! Nodal rotations are rotation matrices updated multiplicatively,
//! R ← exp(δθ)·R, with δθ a *spatial* (global-axes) incremental rotation:
//! large rotations do not add as vectors. Element tangents are written with
//! respect to these spatial increments ("spins").

pub type Mat3 = [[f64; 3]; 3];

pub const IDENTITY: Mat3 = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];

pub fn skew(v: [f64; 3]) -> Mat3 {
    [[0.0, -v[2], v[1]], [v[2], 0.0, -v[0]], [-v[1], v[0], 0.0]]
}

pub fn mat_mul(a: &Mat3, b: &Mat3) -> Mat3 {
    let mut c = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            c[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
        }
    }
    c
}

pub fn transpose(a: &Mat3) -> Mat3 {
    [[a[0][0], a[1][0], a[2][0]], [a[0][1], a[1][1], a[2][1]], [a[0][2], a[1][2], a[2][2]]]
}

pub fn mat_vec(a: &Mat3, x: [f64; 3]) -> [f64; 3] {
    [
        a[0][0] * x[0] + a[0][1] * x[1] + a[0][2] * x[2],
        a[1][0] * x[0] + a[1][1] * x[1] + a[1][2] * x[2],
        a[2][0] * x[0] + a[2][1] * x[1] + a[2][2] * x[2],
    ]
}

/// Aᵀ·x
pub fn mat_t_vec(a: &Mat3, x: [f64; 3]) -> [f64; 3] {
    [
        a[0][0] * x[0] + a[1][0] * x[1] + a[2][0] * x[2],
        a[0][1] * x[0] + a[1][1] * x[1] + a[2][1] * x[2],
        a[0][2] * x[0] + a[1][2] * x[1] + a[2][2] * x[2],
    ]
}

pub fn cross(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

pub fn dot3(a: [f64; 3], b: [f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

pub fn norm3(a: [f64; 3]) -> f64 {
    dot3(a, a).sqrt()
}

/// exp(Ŝ(θ)) by Rodrigues' formula, with series for small angles.
pub fn exp(theta: [f64; 3]) -> Mat3 {
    let t2 = dot3(theta, theta);
    let t = t2.sqrt();
    let (a, b) = if t < 1e-4 {
        (1.0 - t2 / 6.0 + t2 * t2 / 120.0, 0.5 - t2 / 24.0 + t2 * t2 / 720.0)
    } else {
        (t.sin() / t, (1.0 - t.cos()) / t2)
    };
    let s = skew(theta);
    let s2 = mat_mul(&s, &s);
    let mut r = IDENTITY;
    for i in 0..3 {
        for j in 0..3 {
            r[i][j] += a * s[i][j] + b * s2[i][j];
        }
    }
    r
}

/// The rotation vector of R, with |θ| ≤ π.
pub fn log(r: &Mat3) -> [f64; 3] {
    let axial = [r[2][1] - r[1][2], r[0][2] - r[2][0], r[1][0] - r[0][1]];
    let s = 0.5 * norm3(axial); // sin θ
    let c = 0.5 * (r[0][0] + r[1][1] + r[2][2] - 1.0); // cos θ
    let t = s.atan2(c);
    if t < 1e-4 {
        // θ/sin θ ≈ 1 + θ²/6
        let f = 0.5 * (1.0 + t * t / 6.0);
        return [f * axial[0], f * axial[1], f * axial[2]];
    }
    if std::f64::consts::PI - t > 1e-4 {
        let f = 0.5 * t / s;
        return [f * axial[0], f * axial[1], f * axial[2]];
    }
    // Near π the axial vector vanishes: the axis from R + I = 2·n·nᵀ (for θ = π),
    // signed by the axial vector.
    let d = [r[0][0], r[1][1], r[2][2]];
    let k = if d[0] >= d[1] && d[0] >= d[2] { 0 } else if d[1] >= d[2] { 1 } else { 2 };
    let mut n = [0.0; 3];
    n[k] = ((r[k][k] + 1.0) / 2.0).max(0.0).sqrt();
    for i in 0..3 {
        if i != k {
            n[i] = (r[i][k] + r[k][i]) / (4.0 * n[k]);
        }
    }
    let len = norm3(n);
    let sign = if dot3(n, axial) < 0.0 { -1.0 } else { 1.0 };
    [sign * t * n[0] / len, sign * t * n[1] / len, sign * t * n[2] / len]
}

/// T_s⁻¹(θ): maps a spatial incremental rotation δw of exp(θ) to the
/// variation of its rotation vector, δθ = T_s⁻¹(θ)·δw (the inverse left
/// Jacobian of SO(3)): T_s⁻¹ = I − ½·Ŝ(θ) + η·Ŝ(θ)²,
/// η = (1 − (θ/2)·cot(θ/2))/θ².
pub fn ts_inv(theta: [f64; 3]) -> Mat3 {
    let t2 = dot3(theta, theta);
    let t = t2.sqrt();
    let eta = if t < 1e-3 {
        1.0 / 12.0 + t2 / 720.0 + t2 * t2 / 30240.0
    } else {
        (1.0 - 0.5 * t / (0.5 * t).tan()) / t2
    };
    let s = skew(theta);
    let s2 = mat_mul(&s, &s);
    let mut m = IDENTITY;
    for i in 0..3 {
        for j in 0..3 {
            m[i][j] += -0.5 * s[i][j] + eta * s2[i][j];
        }
    }
    m
}
