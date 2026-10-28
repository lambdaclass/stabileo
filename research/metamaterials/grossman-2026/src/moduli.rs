//! Engineering moduli from the stiffness matrix C in (exx, eyy, exy) with tensor shear
//! (energy per area e^T C e / 2). Two-dimensional moduli: force per length.

use serde::Serialize;

/// Rotate C so that the new x axis is at angle `theta` from the old one.
pub fn rotate(c: &[[f64; 3]; 3], theta: f64) -> [[f64; 3]; 3] {
    // Strain transformation e' = T e for tensor components (exx, eyy, exy) to axes rotated by theta.
    let (cs, sn) = (theta.cos(), theta.sin());
    let t = [
        [cs * cs, sn * sn, 2.0 * sn * cs],
        [sn * sn, cs * cs, -2.0 * sn * cs],
        [-sn * cs, sn * cs, cs * cs - sn * sn],
    ];
    // Energy invariance: e^T C e = e'^T C' e' with e = T^{-1} e', so C' = T^{-T} C T^{-1}.
    let ti = invert(&t).expect("rotation is invertible");
    let mut out = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            let mut v = 0.0;
            for a in 0..3 {
                for b in 0..3 {
                    v += ti[a][i] * c[a][b] * ti[b][j];
                }
            }
            out[i][j] = v;
        }
    }
    out
}

pub fn invert(m: &[[f64; 3]; 3]) -> Option<[[f64; 3]; 3]> {
    let det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
        + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    let scale = m.iter().flatten().map(|v| v.abs()).fold(0.0, f64::max);
    if !(det.abs() > 1e-12 * scale * scale * scale) {
        return None;
    }
    let mut r = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            let (a, b) = ((j + 1) % 3, (j + 2) % 3);
            let (c, d) = ((i + 1) % 3, (i + 2) % 3);
            r[i][j] = (m[a][c] * m[b][d] - m[a][d] * m[b][c]) / det;
        }
    }
    Some(r)
}

/// Uniaxial stress along the x axis: Young's modulus and Poisson's ratio -e_yy / e_xx.
/// None when the network has no stiffness against that load.
pub fn uniaxial_x(c: &[[f64; 3]; 3]) -> Option<(f64, f64)> {
    // Compliance in (sxx, syy, sxy) -> (exx, eyy, exy): with tensor shear, sxy = C[2][.] e / 2,
    // so invert the matrix that maps e to (sxx, syy, sxy).
    let mut m = *c;
    for j in 0..3 {
        m[2][j] *= 0.5;
    }
    let s = invert(&m)?;
    if !(s[0][0] > 0.0) {
        return None;
    }
    Some((1.0 / s[0][0], -s[1][0] / s[0][0]))
}

/// Uniaxial stress along direction `theta`.
pub fn uniaxial(c: &[[f64; 3]; 3], theta: f64) -> Option<(f64, f64)> {
    uniaxial_x(&rotate(c, theta))
}

#[derive(Clone, Copy, Debug, Serialize)]
pub struct Isotropic {
    /// Bulk modulus (C11 + C22 + 2 C12) / 4: exact for any network under equal biaxial strain.
    pub bulk: f64,
    /// Shear modulus averaged over directions: (C11 + C22 - 2 C12) / 8 + C33 / 8.
    pub shear: f64,
    /// (B - G) / (B + G), Poisson's ratio of the isotropic material with these B and G.
    pub poisson: f64,
    /// 4 B G / (B + G).
    pub young: f64,
}

pub fn isotropic(c: &[[f64; 3]; 3]) -> Isotropic {
    let bulk = (c[0][0] + c[1][1] + 2.0 * c[0][1]) / 4.0;
    let shear = (c[0][0] + c[1][1] - 2.0 * c[0][1]) / 8.0 + c[2][2] / 8.0;
    let s = bulk + shear;
    let (poisson, young) = if s > 0.0 { ((bulk - shear) / s, 4.0 * bulk * shear / s) } else { (f64::NAN, 0.0) };
    Isotropic { bulk, shear, poisson, young }
}

/// Anisotropy indicator: largest relative deviation of C from the isotropic tensor with the
/// same B and G (0 for an isotropic network).
pub fn anisotropy(c: &[[f64; 3]; 3]) -> f64 {
    let iso = isotropic(c);
    let (b, g) = (iso.bulk, iso.shear);
    let ci = [[b + g, b - g, 0.0], [b - g, b + g, 0.0], [0.0, 0.0, 4.0 * g]];
    let scale = (b + g).abs().max(1e-300);
    let mut m: f64 = 0.0;
    for i in 0..3 {
        for j in 0..3 {
            m = m.max((c[i][j] - ci[i][j]).abs() / scale);
        }
    }
    m
}
