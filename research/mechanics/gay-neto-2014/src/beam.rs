use crate::hd::{Hd, Scalar, N};
use crate::rot::{add, dot, exp, exp_with_rate, lift, log, scale, Quat, V3};

#[derive(Clone, Copy, Debug)]
pub struct Section {
    /// Diagonal of the section stiffness in the element frame: GA1, GA2, EA, EI1, EI2, GJ.
    pub stiffness: [f64; 6],
}

#[derive(Clone, Debug)]
pub struct Beam {
    pub nodes: [usize; 3],
    pub length: f64,
    /// Rows are e1, e2, e3 of the section in the reference configuration; e3 is the axis.
    pub frame: [V3<f64>; 3],
    pub section: Section,
}

pub const GAUSS: [f64; 2] = [-0.577_350_269_189_625_8, 0.577_350_269_189_625_8];

pub fn shape(xi: f64) -> ([f64; 3], [f64; 3]) {
    (
        [0.5 * xi * (xi - 1.0), 1.0 - xi * xi, 0.5 * xi * (xi + 1.0)],
        [xi - 0.5, -2.0 * xi, xi + 0.5],
    )
}

/// Translational and rotational strains, in the section frame, at both Gauss points.
pub fn strains<T: Scalar>(beam: &Beam, x: [V3<T>; 3], q: [Quat<T>; 3]) -> [[T; 6]; 2] {
    let jac = 0.5 * beam.length;
    let qr = q[1];
    let psi1 = log(qr.conj().compose(q[0]));
    let psi3 = log(qr.conj().compose(q[2]));
    let mut out = [[T::cst(0.0); 6]; 2];
    for (g, &xi) in GAUSS.iter().enumerate() {
        let (n, dn) = shape(xi);
        let psi = add(scale(psi1, T::cst(n[0])), scale(psi3, T::cst(n[2])));
        let dpsi = add(
            scale(psi1, T::cst(dn[0] / jac)),
            scale(psi3, T::cst(dn[2] / jac)),
        );
        let (e, de) = exp_with_rate(psi, dpsi);
        let rot = qr.compose(e).matrix();
        let k_rot = scale(e.conj().compose(de).v, T::cst(2.0));
        let mut dx = [T::cst(0.0); 3];
        for (i, xi_node) in x.iter().enumerate() {
            dx = add(dx, scale(*xi_node, T::cst(dn[i] / jac)));
        }
        let mut local = [T::cst(0.0); 3];
        for b in 0..3 {
            local[b] = rot[0][b] * dx[0] + rot[1][b] * dx[1] + rot[2][b] * dx[2];
        }
        for a in 0..3 {
            let f = lift(beam.frame[a]);
            out[g][a] = dot(f, local) + if a == 2 { -1.0 } else { 0.0 };
            out[g][3 + a] = dot(f, k_rot);
        }
    }
    out
}

pub fn energy<T: Scalar>(beam: &Beam, x: [V3<T>; 3], q: [Quat<T>; 3]) -> T {
    let jac = 0.5 * beam.length;
    let mut w = T::cst(0.0);
    for eps in strains(beam, x, q) {
        for k in 0..6 {
            w = w + eps[k] * eps[k] * (0.5 * jac * beam.section.stiffness[k]);
        }
    }
    w
}

/// Gradient and Hessian of the element energy with respect to nodal displacement and
/// spatial rotation increments, evaluated at the current configuration.
pub fn tangent(beam: &Beam, x: [V3<f64>; 3], q: [Quat<f64>; 3]) -> ([f64; N], [[f64; N]; N]) {
    let mut xs = [[Hd::cst(0.0); 3]; 3];
    let mut qs = [Quat::<Hd>::identity(); 3];
    for k in 0..3 {
        let mut th = [Hd::cst(0.0); 3];
        for j in 0..3 {
            xs[k][j] = Hd::var(x[k][j], 6 * k + j);
            th[j] = Hd::var(0.0, 6 * k + 3 + j);
        }
        qs[k] = exp(th).compose(Quat::lift(q[k]));
    }
    let w = energy(beam, xs, qs);
    let mut h = [[0.0; N]; N];
    for i in 0..N {
        for j in 0..N {
            h[i][j] = w.hess(i, j);
        }
    }
    (w.g, h)
}

/// Section forces and moments in the section frame, averaged over the two Gauss points.
pub fn resultants(beam: &Beam, x: [V3<f64>; 3], q: [Quat<f64>; 3]) -> [f64; 6] {
    let eps = strains(beam, x, q);
    let mut r = [0.0; 6];
    for k in 0..6 {
        r[k] = 0.5 * beam.section.stiffness[k] * (eps[0][k] + eps[1][k]);
    }
    r
}
