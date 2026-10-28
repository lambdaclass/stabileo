//! Closed forms printed in Grossman & Boudaoud, Phys. Rev. Research 8, 013224 (2026), coded as
//! printed so the tests compare our networks with the paper's own expressions.

/// Eq. (23): Poisson's ratio of the honeycomb with opposing-vertex distance 2 l (after Gibson
/// et al. 1982, the paper's Ref. 35).
pub fn honeycomb_poisson(l: f64) -> f64 {
    -(2.0 - 4.0 * l) * (l + 0.5) / (3.0 + 4.0 * l - 4.0 * l * l)
}

/// Supplemental Material, Appendix C, Eq. (9): Poisson's ratio of the ordered triangular lattice
/// (phi, psi) at orientation theta, nu = -P / (4 Q), transcribed term by term.
pub fn ordered_poisson(phi: f64, psi: f64, theta: f64) -> f64 {
    let s3 = 3f64.sqrt();
    let a = phi * phi - 2.0 * phi;
    let p2 = psi * psi;
    let p4 = p2 * p2;
    let p6 = p4 * p2;
    let p = (4.0 * theta).cos()
        * (27.0 * p6 - (phi - 2.0).powi(2) * phi * phi * (phi * phi - 2.0 * phi + 4.0) + 9.0 * p4 * a
            - 3.0 * p2 * (a * (a - 20.0) - 16.0))
        + (4.0 * theta).sin() * (2.0 * s3 * psi * (phi - 1.0) * (9.0 * p4 + 6.0 * p2 * (a - 2.0) + a * (a + 8.0)))
        - 48.0 * p2
        + (a - 3.0 * p2) * (9.0 * p4 + 6.0 * p2 * a + a * (a + 4.0));
    let (s, c) = (theta.sin(), theta.cos());
    let q = 36.0 * p4 * s.powi(4)
        + 2.0 * c.powi(4) * (6.0 * p2 * a * a + a * a * (a + 4.0) + 9.0 * p4 * (a + 2.0))
        + 6.0 * p2 * s * s * c * c * (9.0 * p4 + phi.powi(4))
        + 3.0 * p2 * (2.0 * theta).sin().powi(2) * (3.0 * p2 * (a + 2.0) - 2.0 * (phi - 2.0) * (phi * phi - 4.0 * phi + 2.0))
        - 4.0 * s3 * psi * (phi - 1.0) * s * c.powi(3) * (9.0 * p4 + 6.0 * p2 * a + a * (a + 8.0))
        - 48.0 * s3 * psi.powi(3) * (phi - 1.0) * s.powi(3) * c;
    -p / (4.0 * q)
}
