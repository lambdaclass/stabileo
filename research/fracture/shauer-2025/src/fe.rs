//! Adapted from phasefield-jr-py, © 2025 Nathan Shauer (MIT).
//! See ../LICENSE-phasefield-jr-py for the complete upstream notice.
//!
//! Bilinear quadrilateral kernels for the two fields: displacement (2 dofs per node) and the
//! phase field d (1 dof per node), each integrated with 2x2 Gauss points.

use crate::model::Material;

pub const GAUSS: [(f64, f64, f64); 4] = {
    const G: f64 = 0.577_350_269_189_625_8;
    [(-G, -G, 1.0), (-G, G, 1.0), (G, -G, 1.0), (G, G, 1.0)]
};

pub fn shape(xi: f64, eta: f64) -> ([f64; 4], [[f64; 4]; 2]) {
    let n = [
        0.25 * (1.0 - xi) * (1.0 - eta),
        0.25 * (1.0 + xi) * (1.0 - eta),
        0.25 * (1.0 + xi) * (1.0 + eta),
        0.25 * (1.0 - xi) * (1.0 + eta),
    ];
    let dn = [
        [0.25 * (-1.0 + eta), 0.25 * (1.0 - eta), 0.25 * (1.0 + eta), 0.25 * (-1.0 - eta)],
        [0.25 * (-1.0 + xi), 0.25 * (-1.0 - xi), 0.25 * (1.0 + xi), 0.25 * (1.0 - xi)],
    ];
    (n, dn)
}

/// Shape-function gradients in x, y and the Jacobian determinant at (xi, eta).
///
/// `aligned` uses the constant Jacobian of an axis-aligned rectangle exactly as the reference
/// does (base from nodes 0-1, height from nodes 0-3, either sign), so results match it to
/// round-off; otherwise the general bilinear map.
pub fn gradients(x: &[[f64; 2]; 4], dn: &[[f64; 4]; 2], aligned: bool) -> Result<([[f64; 4]; 2], f64), String> {
    let (jinv, det) = if aligned {
        let base = x[1][0] - x[0][0];
        let height = x[3][1] - x[0][1];
        ([[2.0 / base, 0.0], [0.0, 2.0 / height]], base * height / 4.0)
    } else {
        let mut j = [[0.0; 2]; 2];
        for a in 0..4 {
            for r in 0..2 {
                for c in 0..2 {
                    j[r][c] += x[a][r] * dn[c][a];
                }
            }
        }
        let det = j[0][0] * j[1][1] - j[0][1] * j[1][0];
        if !det.is_finite() || det.abs() < 1e-14 {
            return Err("degenerate element: Jacobian determinant is zero".into());
        }
        ([[j[1][1] / det, -j[0][1] / det], [-j[1][0] / det, j[0][0] / det]], det)
    };
    if !det.is_finite() || det.abs() < 1e-14 || jinv.iter().flatten().any(|v| !v.is_finite()) {
        return Err("degenerate element: invalid Jacobian".into());
    }
    let mut g = [[0.0; 4]; 2];
    for a in 0..4 {
        for r in 0..2 {
            g[r][a] = jinv[0][r] * dn[0][a] + jinv[1][r] * dn[1][a];
        }
    }
    Ok((g, det))
}

/// Symmetric small strain (exx, eyy, exy) from element displacements [ux0, uy0, ux1, ...].
pub fn strain(g: &[[f64; 4]; 2], ue: &[f64; 8]) -> [f64; 3] {
    let (mut dux_dx, mut dux_dy, mut duy_dx, mut duy_dy) = (0.0, 0.0, 0.0, 0.0);
    for a in 0..4 {
        dux_dx += g[0][a] * ue[2 * a];
        dux_dy += g[1][a] * ue[2 * a];
        duy_dx += g[0][a] * ue[2 * a + 1];
        duy_dy += g[1][a] * ue[2 * a + 1];
    }
    [dux_dx, duy_dy, 0.5 * (dux_dy + duy_dx)]
}

pub fn stress(mat: &Material, eps: &[f64; 3]) -> [f64; 3] {
    let d = mat.d_matrix();
    let v = [eps[0], eps[1], 2.0 * eps[2]];
    let mut s = [0.0; 3];
    for r in 0..3 {
        for c in 0..3 {
            s[r] += d[r][c] * v[c];
        }
    }
    s
}

fn principal(t: &[f64; 3]) -> [f64; 2] {
    let m = 0.5 * (t[0] + t[1]);
    let r = (0.25 * (t[0] - t[1]) * (t[0] - t[1]) + t[2] * t[2]).sqrt();
    [m - r, m + r]
}

/// The driving energy of the reference: psi+ = 1/2 sum over principal strains e_i > 0 of
/// s_i e_i, with s_i the principal values of the undamaged stress. For an isotropic D the
/// principal directions of stress and strain coincide and s_i is increasing in e_i, so pairing
/// sorted values pairs the same directions.
pub fn psi_plus(mat: &Material, eps: &[f64; 3]) -> f64 {
    let s = stress(mat, eps);
    let ps = principal(&s);
    let pe = principal(eps);
    let mut sum = 0.0;
    for i in 0..2 {
        if pe[i] > 0.0 {
            sum += ps[i] * pe[i];
        }
    }
    0.5 * sum
}

pub fn psi_total(mat: &Material, eps: &[f64; 3]) -> f64 {
    let s = stress(mat, eps);
    0.5 * (s[0] * eps[0] + s[1] * eps[1] + 2.0 * s[2] * eps[2])
}

pub fn degradation(d: f64) -> f64 {
    (1.0 - d) * (1.0 - d)
}

/// Degraded elastic stiffness: sum over Gauss points of g(d) B^T D B |J|.
pub fn elastic_stiffness(mat: &Material, x: &[[f64; 2]; 4], de: &[f64; 4], aligned: bool) -> Result<[[f64; 8]; 8], String> {
    let dm = mat.d_matrix();
    let mut k = [[0.0; 8]; 8];
    for &(xi, eta, w) in GAUSS.iter() {
        let (n, dn) = shape(xi, eta);
        let (g, det) = gradients(x, &dn, aligned)?;
        let d_qp: f64 = (0..4).map(|a| n[a] * de[a]).sum();
        let f = degradation(d_qp) * w * det;
        let mut b = [[0.0; 8]; 3];
        for a in 0..4 {
            b[0][2 * a] = g[0][a];
            b[1][2 * a + 1] = g[1][a];
            b[2][2 * a] = g[1][a];
            b[2][2 * a + 1] = g[0][a];
        }
        let mut db = [[0.0; 8]; 3];
        for r in 0..3 {
            for c in 0..8 {
                db[r][c] = dm[r][0] * b[0][c] + dm[r][1] * b[1][c] + dm[r][2] * b[2][c];
            }
        }
        for i in 0..8 {
            for j in 0..8 {
                k[i][j] += f * (b[0][i] * db[0][j] + b[1][i] * db[1][j] + b[2][i] * db[2][j]);
            }
        }
    }
    Ok(k)
}

/// AT2 damage system at fixed displacement:
///   K = sum (Gc l/2 grad N . grad N + (Gc/(2 l) + H) N N) |J|,  f = sum H N |J|,
/// i.e. the weak form of Gc/l d - Gc l lap d = 2 (1 - d) H, with H = psi+ (or its history).
/// `h_qp` gives H at each Gauss point.
pub fn damage_system(mat: &Material, x: &[[f64; 2]; 4], h_qp: &[f64; 4], aligned: bool) -> Result<([[f64; 4]; 4], [f64; 4]), String> {
    let (gc, l0) = (mat.gc, mat.l0);
    let c0 = 2.0;
    let mut k = [[0.0; 4]; 4];
    let mut f = [0.0; 4];
    for (q, &(xi, eta, w)) in GAUSS.iter().enumerate() {
        let (n, dn) = shape(xi, eta);
        let (g, det) = gradients(x, &dn, aligned)?;
        let h = h_qp[q];
        let s = det * w;
        for i in 0..4 {
            for j in 0..4 {
                k[i][j] += s * (gc * l0 / c0 * (g[0][i] * g[0][j] + g[1][i] * g[1][j]) + (gc / (l0 * c0) + h) * n[i] * n[j]);
            }
            f[i] += s * h * n[i];
        }
    }
    Ok((k, f))
}
