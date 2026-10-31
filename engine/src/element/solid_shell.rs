/// SHB8-ANS-EAS: 8-node solid-shell element with ANS + EAS anti-locking.
///
/// 8-node trilinear hex, 3 DOFs/node (translations only), 24 total DOFs.
/// Full 2×2×2 Gauss integration. ANS on the covariant thickness strain (E_ζζ)
/// and transverse shears (E_ξζ, E_ηζ) to prevent curvature thickness locking
/// and transverse shear locking; one condensed EAS mode (thickness strain linear
/// in ζ) to prevent Poisson thickness locking, four membrane EAS modes against in-plane
/// shear locking; ζ (nodes 1-4 → 5-8) is the thickness direction. The cures:
///   - transverse shear locking (thin bending):   ANS 2E_ξζ, 2E_ηζ (Dvorkin–Bathe)
///   - curvature thickness locking (curved/       ANS E_ζζ at 4 mid-surface corners
///     trapezoidal sections):                     (Betsch–Stein; Bischoff–Ramm)
///   - Poisson thickness locking (any bending     EAS E_ζζ = ζ·α (Büchter–Ramm–Roehl;
///     with ν ≠ 0, ~23 % too stiff at ν = 0.3):    Simo–Rifai mapping), issue #400
///   - in-plane shear locking (in-plane bending): EAS-4 membrane modes (Andelfinger–Ramm)
///
/// Node numbering:
///     8---7       Top face: 5,6,7,8 (ζ = +1)
///    /|  /|       Bottom face: 1,2,3,4 (ζ = -1)
///   5---6  |      ξ: 1→2, η: 1→4, ζ: bottom→top
///   |  4--|3
///   | /   |/
///   1---2
///
/// Natural coordinates:
///   1:(-1,-1,-1) 2:(+1,-1,-1) 3:(+1,+1,-1) 4:(-1,+1,-1)
///   5:(-1,-1,+1) 6:(+1,-1,+1) 7:(+1,+1,+1) 8:(-1,+1,+1)

use crate::element::quad::QuadStressResult;

// ==================== Shape Functions ====================

/// Node natural coordinates: (ξ_i, η_i, ζ_i) for nodes 1-8.
const NODE_COORDS: [[f64; 3]; 8] = [
    [-1.0, -1.0, -1.0], // 1
    [ 1.0, -1.0, -1.0], // 2
    [ 1.0,  1.0, -1.0], // 3
    [-1.0,  1.0, -1.0], // 4
    [-1.0, -1.0,  1.0], // 5
    [ 1.0, -1.0,  1.0], // 6
    [ 1.0,  1.0,  1.0], // 7
    [-1.0,  1.0,  1.0], // 8
];

/// Trilinear hex8 shape functions: N_i = (1/8)(1 + ξ_i·ξ)(1 + η_i·η)(1 + ζ_i·ζ)
pub fn shape_functions_hex8(xi: f64, eta: f64, zeta: f64) -> [f64; 8] {
    let mut n = [0.0; 8];
    for i in 0..8 {
        n[i] = 0.125
            * (1.0 + NODE_COORDS[i][0] * xi)
            * (1.0 + NODE_COORDS[i][1] * eta)
            * (1.0 + NODE_COORDS[i][2] * zeta);
    }
    n
}

/// Derivatives of hex8 shape functions: dN/dξ, dN/dη, dN/dζ (each length 8).
pub fn shape_derivatives_hex8(xi: f64, eta: f64, zeta: f64) -> [[f64; 8]; 3] {
    let mut dn = [[0.0; 8]; 3];
    for i in 0..8 {
        let xi_i = NODE_COORDS[i][0];
        let eta_i = NODE_COORDS[i][1];
        let zeta_i = NODE_COORDS[i][2];
        dn[0][i] = 0.125 * xi_i * (1.0 + eta_i * eta) * (1.0 + zeta_i * zeta);
        dn[1][i] = 0.125 * (1.0 + xi_i * xi) * eta_i * (1.0 + zeta_i * zeta);
        dn[2][i] = 0.125 * (1.0 + xi_i * xi) * (1.0 + eta_i * eta) * zeta_i;
    }
    dn
}

// ==================== Quadrature ====================

/// 2×2×2 Gauss quadrature: returns [(ξ, η, ζ, weight); 8].
pub fn gauss_2x2x2() -> [(f64, f64, f64, f64); 8] {
    let g = 1.0 / 3.0_f64.sqrt(); // ≈ 0.57735
    let pts = [-g, g];
    let mut result = [(0.0, 0.0, 0.0, 0.0); 8];
    let mut idx = 0;
    for &zi in &pts {
        for &ei in &pts {
            for &xi in &pts {
                result[idx] = (xi, ei, zi, 1.0); // weight = 1×1×1 = 1
                idx += 1;
            }
        }
    }
    result
}

// ==================== Jacobian ====================

/// 3×3 Jacobian, its inverse, and determinant from physical coords and shape derivatives.
/// coords: [[x,y,z]; 8], dn: [dN/dξ, dN/dη, dN/dζ] each length 8.
/// Returns (J[3][3], J_inv[3][3], det_J).
pub fn jacobian_3d(coords: &[[f64; 3]; 8], dn: &[[f64; 8]; 3]) -> ([[f64; 3]; 3], [[f64; 3]; 3], f64) {
    let mut j = [[0.0; 3]; 3];
    for a in 0..3 {
        for b in 0..3 {
            for i in 0..8 {
                j[a][b] += dn[a][i] * coords[i][b];
            }
        }
    }

    // Determinant
    let det = j[0][0] * (j[1][1] * j[2][2] - j[1][2] * j[2][1])
            - j[0][1] * (j[1][0] * j[2][2] - j[1][2] * j[2][0])
            + j[0][2] * (j[1][0] * j[2][1] - j[1][1] * j[2][0]);

    // Inverse via cofactors
    let inv_det = 1.0 / det;
    let mut ji = [[0.0; 3]; 3];
    ji[0][0] = (j[1][1] * j[2][2] - j[1][2] * j[2][1]) * inv_det;
    ji[0][1] = (j[0][2] * j[2][1] - j[0][1] * j[2][2]) * inv_det;
    ji[0][2] = (j[0][1] * j[1][2] - j[0][2] * j[1][1]) * inv_det;
    ji[1][0] = (j[1][2] * j[2][0] - j[1][0] * j[2][2]) * inv_det;
    ji[1][1] = (j[0][0] * j[2][2] - j[0][2] * j[2][0]) * inv_det;
    ji[1][2] = (j[0][2] * j[1][0] - j[0][0] * j[1][2]) * inv_det;
    ji[2][0] = (j[1][0] * j[2][1] - j[1][1] * j[2][0]) * inv_det;
    ji[2][1] = (j[0][1] * j[2][0] - j[0][0] * j[2][1]) * inv_det;
    ji[2][2] = (j[0][0] * j[1][1] - j[0][1] * j[1][0]) * inv_det;

    (j, ji, det)
}

// ==================== Material Matrix ====================

/// 6×6 isotropic 3D elasticity in Voigt notation [εxx, εyy, εzz, γxy, γyz, γxz].
/// E in consistent units (kN/m²), ν dimensionless.
fn material_matrix_3d(e: f64, nu: f64) -> [f64; 36] {
    let f = e / ((1.0 + nu) * (1.0 - 2.0 * nu));
    let c11 = f * (1.0 - nu);
    let c12 = f * nu;
    let c44 = f * (1.0 - 2.0 * nu) / 2.0; // = G = E/(2(1+ν))
    [
        c11, c12, c12, 0.0, 0.0, 0.0,
        c12, c11, c12, 0.0, 0.0, 0.0,
        c12, c12, c11, 0.0, 0.0, 0.0,
        0.0, 0.0, 0.0, c44, 0.0, 0.0,
        0.0, 0.0, 0.0, 0.0, c44, 0.0,
        0.0, 0.0, 0.0, 0.0, 0.0, c44,
    ]
}

// ==================== B-Matrix ====================

/// Build standard 6×24 strain-displacement matrix at a point (test reference for the
/// covariant route).
#[cfg(test)]
/// dn_dx[a][i] = ∂N_i/∂x_a (physical derivatives, a=0,1,2 for x,y,z).
fn build_b_matrix(dn_dx: &[[f64; 8]; 3]) -> [f64; 144] {
    let mut b = [0.0; 144]; // 6 × 24
    for i in 0..8 {
        let col = i * 3;
        // εxx = ∂u/∂x
        b[0 * 24 + col]     = dn_dx[0][i];
        // εyy = ∂v/∂y
        b[1 * 24 + col + 1] = dn_dx[1][i];
        // εzz = ∂w/∂z
        b[2 * 24 + col + 2] = dn_dx[2][i];
        // γxy = ∂u/∂y + ∂v/∂x
        b[3 * 24 + col]     = dn_dx[1][i];
        b[3 * 24 + col + 1] = dn_dx[0][i];
        // γyz = ∂v/∂z + ∂w/∂y
        b[4 * 24 + col + 1] = dn_dx[2][i];
        b[4 * 24 + col + 2] = dn_dx[1][i];
        // γxz = ∂u/∂z + ∂w/∂x
        b[5 * 24 + col]     = dn_dx[2][i];
        b[5 * 24 + col + 2] = dn_dx[0][i];
    }
    b
}

/// Compute physical derivatives ∂N/∂(x,y,z) from Jacobian inverse and natural derivatives.
fn physical_derivatives(ji: &[[f64; 3]; 3], dn: &[[f64; 8]; 3]) -> [[f64; 8]; 3] {
    let mut dn_dx = [[0.0; 8]; 3];
    for i in 0..8 {
        for a in 0..3 {
            dn_dx[a][i] = ji[a][0] * dn[0][i] + ji[a][1] * dn[1][i] + ji[a][2] * dn[2][i];
        }
    }
    dn_dx
}

// ==================== ANS Tying ====================

/// Covariant (convective-frame) strain rows at a point, Voigt order
/// [E_ξξ, E_ηη, E_ζζ, 2E_ξη, 2E_ηζ, 2E_ξζ], 6×24.
/// E_kl = ½(g_k·∂u/∂θ_l + g_l·∂u/∂θ_k) with covariant base vectors g_k = ∂X/∂θ_k
/// (rows of J). These are scalars, so they do not depend on the global frame.
fn covariant_b_matrix(j: &[[f64; 3]; 3], dn: &[[f64; 8]; 3]) -> [f64; 144] {
    const PAIRS: [(usize, usize); 6] = [(0, 0), (1, 1), (2, 2), (0, 1), (1, 2), (0, 2)];
    let mut b = [0.0; 144];
    for (r, &(k, l)) in PAIRS.iter().enumerate() {
        for i in 0..8 {
            for a in 0..3 {
                b[r * 24 + i * 3 + a] = if k == l {
                    dn[k][i] * j[k][a]
                } else {
                    dn[l][i] * j[k][a] + dn[k][i] * j[l][a]
                };
            }
        }
    }
    b
}

/// 6×6 map from covariant to Cartesian engineering strains (both Voigt, shear as γ):
/// ε_ab = Σ E_kl G^k_a G^l_b with the contravariant base vectors G^k = ∂θ_k/∂x
/// (columns of J⁻¹). Cartesian order [εxx, εyy, εzz, γxy, γyz, γxz].
fn covariant_to_cartesian(ji: &[[f64; 3]; 3]) -> [f64; 36] {
    const PAIRS: [(usize, usize); 6] = [(0, 0), (1, 1), (2, 2), (0, 1), (1, 2), (0, 2)];
    let g = |k: usize, a: usize| ji[a][k]; // G^k_a
    let mut t = [0.0; 36];
    for (r, &(a, b)) in PAIRS.iter().enumerate() {
        let f = if a == b { 1.0 } else { 2.0 };
        for (c, &(k, l)) in PAIRS.iter().enumerate() {
            t[r * 6 + c] = f * if k == l {
                g(k, a) * g(k, b)
            } else {
                0.5 * (g(k, a) * g(l, b) + g(l, a) * g(k, b))
            };
        }
    }
    t
}

/// Covariant ANS tying-point rows (each 24 entries).
///
/// Thickness strain E_ζζ: 4 mid-surface corner points (±1, ±1, 0) (Betsch & Stein 1995;
/// Bischoff & Ramm 1997) — removes curvature thickness locking.
/// Transverse shear 2E_ξζ: mid-edge points A (0,-1,0), B (0,+1,0); 2E_ηζ: C (-1,0,0),
/// D (+1,0,0) (Dvorkin & Bathe 1984) — removes transverse shear locking.
/// Tying covariant components (not global Cartesian ε_zz, γ_xz, γ_yz) is what makes
/// the element frame invariant and lets the assumed field follow the thickness
/// direction of a tilted or curved shell.
struct AnsTyingData {
    b_zz: [[f64; 24]; 4],
    b_xz: [[f64; 24]; 2],
    b_yz: [[f64; 24]; 2],
}

/// Pre-compute ANS tying data from element coordinates.
fn compute_ans_tying(coords: &[[f64; 3]; 8]) -> AnsTyingData {
    let row = |(xi, eta, zeta): (f64, f64, f64), r: usize| -> [f64; 24] {
        let dn = shape_derivatives_hex8(xi, eta, zeta);
        let (j, _, _) = jacobian_3d(coords, &dn);
        let b = covariant_b_matrix(&j, &dn);
        std::array::from_fn(|c| b[r * 24 + c])
    };
    let zz_pts = [(-1.0, -1.0, 0.0), (1.0, -1.0, 0.0), (1.0, 1.0, 0.0), (-1.0, 1.0, 0.0)];
    AnsTyingData {
        b_zz: zz_pts.map(|p| row(p, 2)),
        b_xz: [(0.0, -1.0, 0.0), (0.0, 1.0, 0.0)].map(|p| row(p, 5)),
        b_yz: [(-1.0, 0.0, 0.0), (1.0, 0.0, 0.0)].map(|p| row(p, 4)),
    }
}

/// Replace the E_ζζ, 2E_ηζ, 2E_ξζ rows of the covariant B with ANS-interpolated values.
fn apply_ans(b: &mut [f64; 144], xi: f64, eta: f64, tying: &AnsTyingData) {
    // Bilinear interpolation for E_ζζ from 4 corner tying points
    let w_zz = [
        0.25 * (1.0 - xi) * (1.0 - eta),
        0.25 * (1.0 + xi) * (1.0 - eta),
        0.25 * (1.0 + xi) * (1.0 + eta),
        0.25 * (1.0 - xi) * (1.0 + eta),
    ];
    // Linear in η for 2E_ξζ (A, B); linear in ξ for 2E_ηζ (C, D)
    let (wa, wb) = (0.5 * (1.0 - eta), 0.5 * (1.0 + eta));
    let (wc, wd) = (0.5 * (1.0 - xi), 0.5 * (1.0 + xi));
    for col in 0..24 {
        b[2 * 24 + col] = (0..4).map(|k| w_zz[k] * tying.b_zz[k][col]).sum();
        b[5 * 24 + col] = wa * tying.b_xz[0][col] + wb * tying.b_xz[1][col];
        b[4 * 24 + col] = wc * tying.b_yz[0][col] + wd * tying.b_yz[1][col];
    }
}

/// Cartesian 6×24 B with ANS at a point: B = T(J⁻¹) · B_cov,ANS.
fn ans_b_matrix(coords: &[[f64; 3]; 8], xi: f64, eta: f64, zeta: f64, tying: &AnsTyingData) -> ([f64; 144], f64) {
    let dn = shape_derivatives_hex8(xi, eta, zeta);
    let (j, ji, det_j) = jacobian_3d(coords, &dn);
    let mut bc = covariant_b_matrix(&j, &dn);
    apply_ans(&mut bc, xi, eta, tying);
    let t = covariant_to_cartesian(&ji);
    let mut b = [0.0; 144];
    for r in 0..6 {
        for p in 0..6 {
            let trp = t[r * 6 + p];
            if trp != 0.0 {
                for col in 0..24 {
                    b[r * 24 + col] += trp * bc[p * 24 + col];
                }
            }
        }
    }
    (b, det_j)
}

// ==================== EAS (Enhanced Assumed Strain) ====================

/// Enhanced assumed strains (EAS): one thickness mode against Poisson thickness locking
/// (issue #400) and four membrane modes against in-plane shear locking.
///
/// 1. Poisson thickness locking. In bending the in-plane strains vary linearly through the
/// thickness, ε_xx = z·κ_x. With the full 3D law and σ_zz ≈ 0 (thin shell), equilibrium
/// through the thickness requires ε_zz = −ν/(1 − ν)·(ε_xx + ε_yy), a thickness strain that is
/// ALSO linear in z. The trilinear field gives w linear in ζ, so ε_zz = ∂w/∂z is constant in ζ
/// (the ANS above interpolates it from mid-surface points, still constant in ζ). The linear
/// part of ε_zz is forced to zero, σ_zz = λ(ε_xx + ε_yy) appears with the bending stresses, and
/// the bending rigidity is the constrained modulus E(1 − ν)/((1 + ν)(1 − 2ν)) instead of the
/// plate modulus E/(1 − ν²): too stiff by (1 − ν)²/(1 − 2ν) = 1.225 at ν = 0.3, a simply
/// supported plate's centre deflection stalls at 0.816 of Navier on every mesh. In-plane mesh
/// refinement cannot remove it: it is a defect of the thickness interpolation (Büchter, Ramm
/// & Roehl 1994; Bischoff & Ramm 1997). Cure: the enhanced covariant thickness strain
/// Ẽ_ζζ = ζ·α₁ — the "7th parameter" of Büchter–Ramm–Roehl, used in the solid shells of
/// Hauptmann & Schweizerhof 1998, Klinkel, Gruttmann & Wagner 1999, Vu-Quoc & Tan 2003.
///
/// 2. In-plane shear locking. Bending of a layer in its own plane (u = x·y) produces a
/// parasitic shear γ_xy ∝ ξ, η in the bilinear field: a 6 × 1 cantilever of 1 × 0.2 elements
/// loaded in-plane gave 0.09 of the beam deflection. Cure: the membrane EAS-4 set
/// (Andelfinger & Ramm 1993, the EAS form of Wilson's incompatible modes):
/// Ẽ_ξξ = ξ·α₂, Ẽ_ηη = η·α₃, 2Ẽ_ξη = ξ·α₄ + η·α₅.
///
/// Construction (Simo & Rifai 1990). Covariant modes M(ξ, η, ζ) are mapped with the centre
/// transformation T₀ = covariant_to_cartesian(J₀⁻¹) and scaled by det J₀ / det J:
///
///   ε̃ = G·α,   G = (det J₀ / det J)·T₀·M(ξ, η, ζ),   total strain ε = B_ANS·u + G·α.
///
/// The Hu–Washizu principle with the stress orthogonal to the enhanced strain gives, per element,
///
///   [K_uu  K_uα] [u]   [f]        K_uu = ∫ Bᵀ C B dV,   K_uα = ∫ Bᵀ C G dV,
///   [K_αu  K_αα] [α] = [0],       K_αα = ∫ Gᵀ C G dV,
///
/// and α is condensed statically: K = K_uu − K_uα K_αα⁻¹ K_αu, α = −K_αα⁻¹ K_αu u.
///
/// Properties (each one checked by a test):
/// - Patch test: ∫ G dV = det J₀·T₀·∫ M dξdηdζ = 0 (every mode is odd in one natural
///   coordinate), so a constant stress does no work on the enhanced modes, α = 0 for every
///   constant-strain state, on any mesh.
/// - Rigid-body modes: B_ANS·u = 0 for a rigid motion, so K_αu·u = 0 and α = 0.
/// - Stability: the five columns of G are independent and C is positive definite: K_αα ≻ 0.
/// - Frame invariance: G is built from covariant quantities and det J only.
/// - Pure bending of a rectangular plate strip, any ν and t/L: exact.
///
/// Alternative not taken: Abed-Meraim & Combescure's SHB8PS removes Poisson thickness locking
/// by projecting the constitutive law onto plane stress in the thickness direction. That
/// cannot carry a real σ_zz (thick parts, stacked layers, through-thickness pressure); the EAS
/// route keeps the 3D law.
const N_EAS: usize = 5;

/// The element's integrated EAS blocks K_uu, K_uα, K_αα.
struct EasOperators {
    k_uu: Vec<f64>,           // 24×24
    k_ua: [[f64; N_EAS]; 24], // 24×N_EAS
    k_aa: [[f64; N_EAS]; N_EAS],
}

/// Covariant enhanced modes M(ξ, η, ζ): (covariant Voigt row, natural-coordinate factor).
/// Row order [E_ξξ, E_ηη, E_ζζ, 2E_ξη, 2E_ηζ, 2E_ξζ].
fn eas_modes(xi: f64, eta: f64, zeta: f64) -> [(usize, f64); N_EAS] {
    [
        (2, zeta), // E_ζζ ∝ ζ: Poisson thickness locking
        (0, xi),   // E_ξξ ∝ ξ  ┐
        (1, eta),  // E_ηη ∝ η  │ membrane EAS-4 (Andelfinger & Ramm 1993):
        (3, xi),   // 2E_ξη ∝ ξ │ in-plane bending without parasitic shear
        (3, eta),  // 2E_ξη ∝ η ┘
    ]
}

/// Cartesian enhanced-strain matrix G (6×N_EAS) at (ξ, η, ζ), Simo–Rifai mapped:
/// G = (det J₀ / det J)·T₀·M(ξ, η, ζ).
fn eas_g_matrix(t0: &[f64; 36], det0: f64, det_j: f64, xi: f64, eta: f64, zeta: f64) -> [[f64; N_EAS]; 6] {
    let s = det0 / det_j;
    let modes = eas_modes(xi, eta, zeta);
    std::array::from_fn(|r| std::array::from_fn(|a| s * t0[r * 6 + modes[a].0] * modes[a].1))
}

/// C·v for a 6-vector.
fn c_times(c: &[f64; 36], v: &[f64; 6]) -> [f64; 6] {
    std::array::from_fn(|i| (0..6).map(|p| c[i * 6 + p] * v[p]).sum())
}

/// Centre transformation data (T₀, det J₀) for the EAS mapping.
fn eas_centre(coords: &[[f64; 3]; 8]) -> ([f64; 36], f64) {
    let dn0 = shape_derivatives_hex8(0.0, 0.0, 0.0);
    let (_, ji0, det0) = jacobian_3d(coords, &dn0);
    (covariant_to_cartesian(&ji0), det0)
}

fn eas_operators(coords: &[[f64; 3]; 8], c: &[f64; 36]) -> EasOperators {
    let ndof = 24;
    let mut k_uu = vec![0.0; ndof * ndof];
    let mut k_ua = [[0.0; N_EAS]; 24];
    let mut k_aa = [[0.0; N_EAS]; N_EAS];
    let tying = compute_ans_tying(coords);
    let (t0, det0) = eas_centre(coords);

    for &(xi, eta, zeta, w) in &gauss_2x2x2() {
        let (b, det_j) = ans_b_matrix(coords, xi, eta, zeta, &tying);
        let dv = det_j.abs() * w;
        let g = eas_g_matrix(&t0, det0, det_j, xi, eta, zeta);

        // CB = C · B (6×24)
        let mut cb = [0.0; 144];
        for i in 0..6 {
            for j in 0..24 {
                let mut s = 0.0;
                for p in 0..6 {
                    s += c[i * 6 + p] * b[p * 24 + j];
                }
                cb[i * 24 + j] = s;
            }
        }

        // K_uu += Bᵀ · CB · dV
        for i in 0..24 {
            for j in i..24 {
                let mut s = 0.0;
                for p in 0..6 {
                    s += b[p * 24 + i] * cb[p * 24 + j];
                }
                let val = s * dv;
                k_uu[i * ndof + j] += val;
                if i != j {
                    k_uu[j * ndof + i] += val;
                }
            }
        }

        for a in 0..N_EAS {
            let ga: [f64; 6] = std::array::from_fn(|r| g[r][a]);
            let cg = c_times(c, &ga);
            // K_uα += Bᵀ C G dV  (= (CB)ᵀ G, C symmetric)
            for i in 0..24 {
                k_ua[i][a] += (0..6).map(|p| cb[p * 24 + i] * ga[p]).sum::<f64>() * dv;
            }
            // K_αα += Gᵀ C G dV
            for bb in 0..N_EAS {
                k_aa[bb][a] += (0..6).map(|p| g[p][bb] * cg[p]).sum::<f64>() * dv;
            }
        }
    }
    EasOperators { k_uu, k_ua, k_aa }
}

/// Solve K_αα·x = r for the (small, SPD) EAS block by Gaussian elimination.
fn solve_eas(k_aa: &[[f64; N_EAS]; N_EAS], r: &[f64; N_EAS]) -> [f64; N_EAS] {
    let mut a = *k_aa;
    let mut x = *r;
    for p in 0..N_EAS {
        for q in (p + 1)..N_EAS {
            let f = a[q][p] / a[p][p];
            for cc in p..N_EAS {
                a[q][cc] -= f * a[p][cc];
            }
            x[q] -= f * x[p];
        }
    }
    for p in (0..N_EAS).rev() {
        let s: f64 = ((p + 1)..N_EAS).map(|cc| a[p][cc] * x[cc]).sum();
        x[p] = (x[p] - s) / a[p][p];
    }
    x
}

/// Condensed enhanced parameters α = −K_αα⁻¹ K_αu u for an element displacement u.
fn eas_alpha(ops: &EasOperators, u: &[f64]) -> [f64; N_EAS] {
    let r: [f64; N_EAS] = std::array::from_fn(|a| -(0..24).map(|i| ops.k_ua[i][a] * u[i]).sum::<f64>());
    solve_eas(&ops.k_aa, &r)
}

// ==================== Stiffness Matrix ====================

/// 24×24 solid-shell stiffness matrix: ANS (covariant transverse shear and thickness
/// strain) plus five condensed EAS modes (see "EAS (Enhanced Assumed Strain)" above).
/// coords: 8 nodes × [x,y,z], E in kN/m², ν dimensionless.
/// Returns 576 entries in row-major order.
pub fn solid_shell_stiffness(coords: &[[f64; 3]; 8], e: f64, nu: f64) -> Vec<f64> {
    let c = material_matrix_3d(e, nu);
    let ops = eas_operators(coords, &c);
    let mut k = ops.k_uu.clone();
    // K = K_uu − K_uα K_αα⁻¹ K_αu
    let inv_cols: [[f64; N_EAS]; 24] = std::array::from_fn(|i| solve_eas(&ops.k_aa, &ops.k_ua[i]));
    for i in 0..24 {
        for j in 0..24 {
            let s: f64 = (0..N_EAS).map(|a| ops.k_ua[i][a] * inv_cols[j][a]).sum();
            k[i * 24 + j] -= s;
        }
    }
    // Symmetrize the round-off of the condensation.
    for i in 0..24 {
        for j in (i + 1)..24 {
            let m = 0.5 * (k[i * 24 + j] + k[j * 24 + i]);
            k[i * 24 + j] = m;
            k[j * 24 + i] = m;
        }
    }
    k
}

/// Cartesian strain [εxx, εyy, εzz, γxy, γyz, γxz] at (ξ, η, ζ) consistent with the
/// stiffness: ε = B_ANS·u + G·α, α condensed from u. Used by every stress recovery so
/// the reported stresses are those the element's energy is built from.
pub fn solid_shell_strain(coords: &[[f64; 3]; 8], u: &[f64], e: f64, nu: f64, xi: f64, eta: f64, zeta: f64) -> [f64; 6] {
    // Every enhanced mode is odd in one natural coordinate (ζ, ξ or η), so where all of
    // them vanish — the centroid, used by the centroid stress recovery and the geometric
    // stiffness prestress — G = 0 and ε = B_ANS·u exactly: skip building the EAS blocks
    // and solving for α (a full 8-point integration per call).
    if eas_modes(xi, eta, zeta).iter().all(|&(_, f)| f == 0.0) {
        return ans_strain(coords, u, xi, eta, zeta);
    }
    let c = material_matrix_3d(e, nu);
    let ops = eas_operators(coords, &c);
    let alpha = eas_alpha(&ops, u);
    strain_with_alpha(coords, u, &alpha, xi, eta, zeta)
}

/// B_ANS·u at (ξ, η, ζ), without the enhanced part.
fn ans_strain(coords: &[[f64; 3]; 8], u: &[f64], xi: f64, eta: f64, zeta: f64) -> [f64; 6] {
    let tying = compute_ans_tying(coords);
    let (b, _) = ans_b_matrix(coords, xi, eta, zeta, &tying);
    std::array::from_fn(|r| (0..24).map(|j| b[r * 24 + j] * u[j]).sum::<f64>())
}

fn strain_with_alpha(coords: &[[f64; 3]; 8], u: &[f64], alpha: &[f64; N_EAS], xi: f64, eta: f64, zeta: f64) -> [f64; 6] {
    let tying = compute_ans_tying(coords);
    let (t0, det0) = eas_centre(coords);
    let (b, det_j) = ans_b_matrix(coords, xi, eta, zeta, &tying);
    let g = eas_g_matrix(&t0, det0, det_j, xi, eta, zeta);
    std::array::from_fn(|r| {
        (0..24).map(|j| b[r * 24 + j] * u[j]).sum::<f64>() + (0..N_EAS).map(|a| g[r][a] * alpha[a]).sum::<f64>()
    })
}

// ==================== Consistent Mass ====================

/// 24×24 consistent mass matrix for solid-shell.
/// ρ in mass-consistent units (tonnes/m³ = kN·s²/m⁴).
pub fn solid_shell_consistent_mass(coords: &[[f64; 3]; 8], rho: f64) -> Vec<f64> {
    let ndof = 24;
    let mut m = vec![0.0; ndof * ndof];
    let gauss = gauss_2x2x2();

    for &(xi, eta, zeta, w) in &gauss {
        let n = shape_functions_hex8(xi, eta, zeta);
        let dn = shape_derivatives_hex8(xi, eta, zeta);
        let (_, _, det_j) = jacobian_3d(coords, &dn);
        let dv = det_j.abs() * w;

        for i in 0..8 {
            for j in 0..8 {
                let val = rho * n[i] * n[j] * dv;
                for d in 0..3 {
                    m[(i * 3 + d) * ndof + (j * 3 + d)] += val;
                }
            }
        }
    }

    m
}

// ==================== Geometric Stiffness ====================

/// 24×24 geometric stiffness for buckling analysis.
/// Takes full 3D Cauchy stress tensor [σxx, σyy, σzz, τxy, τyz, τxz].
/// Computed from pre-stress state (typically from linear analysis).
pub fn solid_shell_geometric_stiffness(
    coords: &[[f64; 3]; 8],
    stress: &[f64; 6], // [σxx, σyy, σzz, τxy, τyz, τxz]
) -> Vec<f64> {
    let ndof = 24;
    let mut kg = vec![0.0; ndof * ndof];
    let gauss = gauss_2x2x2();

    // σ tensor as 3×3 symmetric matrix
    let s = [
        [stress[0], stress[3], stress[5]],
        [stress[3], stress[1], stress[4]],
        [stress[5], stress[4], stress[2]],
    ];

    for &(xi, eta, zeta, w) in &gauss {
        let dn = shape_derivatives_hex8(xi, eta, zeta);
        let (_, ji, det_j) = jacobian_3d(coords, &dn);
        let dn_dx = physical_derivatives(&ji, &dn);
        let dv = det_j.abs() * w;

        // Kg_IJ = Σ_{ab} ∂N_I/∂x_a · σ_ab · ∂N_J/∂x_b · δ_ij (Kronecker on DOF dirs)
        for ii in 0..8 {
            for jj in 0..8 {
                let mut val = 0.0;
                for a in 0..3 {
                    for b in 0..3 {
                        val += dn_dx[a][ii] * s[a][b] * dn_dx[b][jj];
                    }
                }
                let v = val * dv;
                for d in 0..3 {
                    kg[(ii * 3 + d) * ndof + (jj * 3 + d)] += v;
                }
            }
        }
    }

    kg
}

// ==================== Stress Recovery ====================

fn solid_shell_frame(j: &[[f64; 3]; 3]) -> [[f64; 3]; 3] {
    let norm = |v: [f64; 3]| { let l = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt(); [v[0] / l, v[1] / l, v[2] / l] };
    let e3 = norm(j[2]);
    let d = j[0][0] * e3[0] + j[0][1] * e3[1] + j[0][2] * e3[2];
    let e1 = norm([j[0][0] - d * e3[0], j[0][1] - d * e3[1], j[0][2] - d * e3[2]]);
    let e2 = [e3[1] * e1[2] - e3[2] * e1[1], e3[2] * e1[0] - e3[0] * e1[2], e3[0] * e1[1] - e3[1] * e1[0]];
    [e1, e2, e3]
}

/// Centroid in-plane stresses in the frame e3 ∥ ∂x/∂ζ, e1 ∥ projected ∂x/∂ξ, e2 = e3 × e1.
/// Von Mises uses only these in-plane components; integration-point recovery retains full 3D stress.
pub fn solid_shell_stresses(
    coords: &[[f64; 3]; 8],
    u: &[f64],
    e: f64,
    nu: f64,
) -> QuadStressResult {
    let stress = solid_shell_avg_stress(coords, u, e, nu);

    let (j, _, _) = jacobian_3d(coords, &shape_derivatives_hex8(0.0, 0.0, 0.0));
    let [e1, e2, _] = solid_shell_frame(&j);
    let tensor = [
        [stress[0], stress[3], stress[5]],
        [stress[3], stress[1], stress[4]],
        [stress[5], stress[4], stress[2]],
    ];
    let project = |a: [f64; 3], b: [f64; 3]| -> f64 {
        let mut value = 0.0;
        for p in 0..3 { for q in 0..3 { value += a[p] * tensor[p][q] * b[q]; } }
        value
    };
    let sigma_xx = project(e1, e1);
    let sigma_yy = project(e2, e2);
    let tau_xy = project(e1, e2);
    let von_mises = (sigma_xx * sigma_xx - sigma_xx * sigma_yy + sigma_yy * sigma_yy
        + 3.0 * tau_xy * tau_xy).sqrt();

    QuadStressResult {
        element_id: 0,
        sigma_xx,
        sigma_yy,
        tau_xy,
        mx: 0.0,
        my: 0.0,
        mxy: 0.0,
        von_mises,
    }
}

/// In-plane stress samples at the 2×2×2 integration points, for discretization-error
/// estimation: the in-plane strains (ε11, ε22, γ12) of the strain the element's energy is built
/// from (ANS + condensed EAS, `strain_with_alpha`, as every other stress recovery of this element
/// reads it), in the mid-surface frame of each point (e3 along ∂x/∂ζ, e1 along ∂x/∂ξ), turned
/// into stress with the plane-stress law. The thickness strain and the transverse shears are not
/// sampled: the estimate covers the membrane and bending energy, as for the shells.
pub fn solid_shell_inplane_samples(
    coords: &[[f64; 3]; 8],
    u: &[f64],
    e: f64,
    nu: f64,
) -> Vec<super::ShellStressSample> {
    let c = e / (1.0 - nu * nu);
    // α once per element.
    let alpha = eas_alpha(&eas_operators(coords, &material_matrix_3d(e, nu)), u);
    let mut out = Vec::with_capacity(8);
    for &(xi, eta, zeta, w) in &gauss_2x2x2() {
        let dn = shape_derivatives_hex8(xi, eta, zeta);
        let (j, _ji, det_j) = jacobian_3d(coords, &dn);
        if !(det_j.abs() > 1e-30) { continue; }
        let s = strain_with_alpha(coords, u, &alpha, xi, eta, zeta);
        // Global strain tensor from Voigt [εxx, εyy, εzz, γxy, γyz, γxz].
        let eps = [
            [s[0], 0.5 * s[3], 0.5 * s[5]],
            [0.5 * s[3], s[1], 0.5 * s[4]],
            [0.5 * s[5], 0.5 * s[4], s[2]],
        ];
        let [e1, e2, e3] = solid_shell_frame(&j);
        let proj = |a: &[f64; 3], bv: &[f64; 3]| -> f64 {
            let mut acc = 0.0;
            for p in 0..3 { for q in 0..3 { acc += a[p] * eps[p][q] * bv[q]; } }
            acc
        };
        let (e11, e22, g12) = (proj(&e1, &e1), proj(&e2, &e2), 2.0 * proj(&e1, &e2));
        let n = shape_functions_hex8(xi, eta, zeta);
        let mut pos = [0.0; 3];
        for i in 0..8 { for k in 0..3 { pos[k] += n[i] * coords[i][k]; } }
        out.push(super::ShellStressSample {
            xi, eta, zeta, pos,
            frame: [e1, e2, e3],
            sigma: [c * (e11 + nu * e22), c * (nu * e11 + e22), c * (1.0 - nu) / 2.0 * g12],
            weight: det_j.abs() * w,
        });
    }
    out
}

/// Average stress tensor at element centroid (for geometric stiffness).
pub fn solid_shell_avg_stress(
    coords: &[[f64; 3]; 8],
    u: &[f64],
    e: f64,
    nu: f64,
) -> [f64; 6] {
    let c = material_matrix_3d(e, nu);
    let strain = solid_shell_strain(coords, u, e, nu, 0.0, 0.0, 0.0);
    c_times(&c, &strain)
}

/// Nodal von Mises stresses (evaluate at each of the 8 Gauss points,
/// report one value per GP — no extrapolation needed for hex8).
pub fn solid_shell_nodal_von_mises(
    coords: &[[f64; 3]; 8],
    u: &[f64],
    e: f64,
    nu: f64,
) -> Vec<f64> {
    let c = material_matrix_3d(e, nu);
    let alpha = eas_alpha(&eas_operators(coords, &c), u);
    let mut vm = Vec::with_capacity(8);

    for &(xi, eta, zeta, _) in &gauss_2x2x2() {
        let strain = strain_with_alpha(coords, u, &alpha, xi, eta, zeta);
        let stress = c_times(&c, &strain);

        let sx = stress[0];
        let sy = stress[1];
        let sz = stress[2];
        let txy = stress[3];
        let tyz = stress[4];
        let txz = stress[5];
        let v = ((sx - sy).powi(2) + (sy - sz).powi(2) + (sz - sx).powi(2)
            + 6.0 * (txy * txy + tyz * tyz + txz * txz))
            .sqrt()
            / 2.0_f64.sqrt();
        vm.push(v);
    }

    vm
}

// ==================== Loads ====================

/// Top-face pressure load (consistent nodal forces).
/// Positive pressure = push inward (toward bottom face).
/// Returns 24-element force vector in global coordinates.
pub fn solid_shell_pressure_load(coords: &[[f64; 3]; 8], pressure: f64) -> Vec<f64> {
    let mut f = vec![0.0; 24];

    // Top face nodes: 5,6,7,8 (indices 4,5,6,7)
    // 2D Gauss 2×2 on top face (ζ = +1)
    let g = 1.0 / 3.0_f64.sqrt();
    let gp2d = [(-g, -g), (g, -g), (g, g), (-g, g)];

    for &(xi, eta) in &gp2d {
        let zeta = 1.0; // top face
        let dn = shape_derivatives_hex8(xi, eta, zeta);

        // Tangent vectors on top face
        let mut dxdxi = [0.0; 3];
        let mut dxdeta = [0.0; 3];
        for i in 0..8 {
            for a in 0..3 {
                dxdxi[a] += dn[0][i] * coords[i][a];
                dxdeta[a] += dn[1][i] * coords[i][a];
            }
        }

        // Normal = dxdxi × dxdeta (outward for top face)
        let normal = [
            dxdxi[1] * dxdeta[2] - dxdxi[2] * dxdeta[1],
            dxdxi[2] * dxdeta[0] - dxdxi[0] * dxdeta[2],
            dxdxi[0] * dxdeta[1] - dxdxi[1] * dxdeta[0],
        ];

        let n = shape_functions_hex8(xi, eta, zeta);

        // Pressure acts inward (negative normal direction)
        for i in 0..8 {
            for a in 0..3 {
                f[i * 3 + a] -= pressure * normal[a] * n[i]; // weight = 1
            }
        }
    }

    f
}

/// Self-weight body force (volumetric gravity).
/// ρ in kg/m³, g components in m/s².
/// Returns 24-element force vector in global coordinates (in kN).
pub fn solid_shell_self_weight_load(
    coords: &[[f64; 3]; 8],
    rho: f64,
    gx: f64, gy: f64, gz: f64,
) -> Vec<f64> {
    let mut f = vec![0.0; 24];
    let gauss = gauss_2x2x2();

    for &(xi, eta, zeta, w) in &gauss {
        let n = shape_functions_hex8(xi, eta, zeta);
        let dn = shape_derivatives_hex8(xi, eta, zeta);
        let (_, _, det_j) = jacobian_3d(coords, &dn);
        let dv = det_j.abs() * w;

        // Body force = ρ·g (convert kg/m³ to kN/m³ via /1000)
        let rho_kn = rho / 1000.0;
        for i in 0..8 {
            f[i * 3]     += rho_kn * gx * n[i] * dv;
            f[i * 3 + 1] += rho_kn * gy * n[i] * dv;
            f[i * 3 + 2] += rho_kn * gz * n[i] * dv;
        }
    }

    f
}

// ==================== Quality Check ====================

/// Quality metrics for an 8-node hex (solid-shell) element.
pub struct HexQualityMetrics {
    /// max_edge / min_edge across all 12 hex edges.
    pub aspect_ratio: f64,
    /// min(|det J|) / max(|det J|) over 2×2×2 Gauss points. Ideal = 1.0.
    pub jacobian_ratio: f64,
}

/// Compute mesh-quality metrics for an 8-node hex element.
///
/// Aspect ratio is the ratio of the longest to shortest of the 12 edges.
/// Jacobian ratio is min/max |det J| over the 8 Gauss points.
pub fn solid_shell_quality_metrics(coords: &[[f64; 3]; 8]) -> HexQualityMetrics {
    // 12 edges of a hex: bottom(0-1,1-2,2-3,3-0), top(4-5,5-6,6-7,7-4), verticals(0-4,1-5,2-6,3-7)
    let edge_pairs: [(usize, usize); 12] = [
        (0, 1), (1, 2), (2, 3), (3, 0),
        (4, 5), (5, 6), (6, 7), (7, 4),
        (0, 4), (1, 5), (2, 6), (3, 7),
    ];
    let mut max_edge = 0.0_f64;
    let mut min_edge = f64::INFINITY;
    for &(a, b) in &edge_pairs {
        let dx = coords[b][0] - coords[a][0];
        let dy = coords[b][1] - coords[a][1];
        let dz = coords[b][2] - coords[a][2];
        let len = (dx * dx + dy * dy + dz * dz).sqrt();
        max_edge = max_edge.max(len);
        min_edge = min_edge.min(len);
    }
    let aspect_ratio = if min_edge > 1e-15 { max_edge / min_edge } else { f64::INFINITY };

    // Jacobian ratio from 2×2×2 Gauss
    let gauss = gauss_2x2x2();
    let mut min_det = f64::INFINITY;
    let mut max_det = 0.0_f64;
    for &(xi, eta, zeta, _) in &gauss {
        let dn = shape_derivatives_hex8(xi, eta, zeta);
        let (_, _, det_j) = jacobian_3d(coords, &dn);
        let d = det_j.abs();
        min_det = min_det.min(d);
        max_det = max_det.max(d);
    }
    let jacobian_ratio = if max_det > 1e-15 { min_det / max_det } else { 0.0 };

    HexQualityMetrics {
        aspect_ratio,
        jacobian_ratio,
    }
}

/// Check Jacobian quality at all 8 Gauss points.
/// Returns (min_det, max_det, all_positive).
pub fn solid_shell_check_jacobian(coords: &[[f64; 3]; 8]) -> (f64, f64, bool) {
    let gauss = gauss_2x2x2();
    let mut min_det = f64::MAX;
    let mut max_det = f64::MIN;
    let mut all_pos = true;

    for &(xi, eta, zeta, _) in &gauss {
        let dn = shape_derivatives_hex8(xi, eta, zeta);
        let (_, _, det_j) = jacobian_3d(coords, &dn);
        min_det = min_det.min(det_j);
        max_det = max_det.max(det_j);
        if det_j <= 0.0 {
            all_pos = false;
        }
    }

    (min_det, max_det, all_pos)
}

// ==================== Element Volume ====================

/// Compute element volume via numerical integration.
pub fn solid_shell_volume(coords: &[[f64; 3]; 8]) -> f64 {
    let gauss = gauss_2x2x2();
    let mut vol = 0.0;
    for &(xi, eta, zeta, w) in &gauss {
        let dn = shape_derivatives_hex8(xi, eta, zeta);
        let (_, _, det_j) = jacobian_3d(coords, &dn);
        vol += det_j.abs() * w;
    }
    vol
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Unit cube: nodes at corners of [0,1]³.
    fn unit_cube() -> [[f64; 3]; 8] {
        [
            [0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 1.0, 0.0], [0.0, 1.0, 0.0],
            [0.0, 0.0, 1.0], [1.0, 0.0, 1.0], [1.0, 1.0, 1.0], [0.0, 1.0, 1.0],
        ]
    }

    #[test]
    fn test_shape_functions_partition_of_unity() {
        let pts = [(-0.5, 0.3, 0.7), (0.0, 0.0, 0.0), (1.0, 1.0, 1.0)];
        for &(xi, eta, zeta) in &pts {
            let n = shape_functions_hex8(xi, eta, zeta);
            let sum: f64 = n.iter().sum();
            assert!((sum - 1.0).abs() < 1e-14, "Partition of unity failed: sum = {}", sum);
        }
    }

    #[test]
    fn test_unit_cube_volume() {
        let vol = solid_shell_volume(&unit_cube());
        assert!((vol - 1.0).abs() < 1e-12, "Volume = {}", vol);
    }

    #[test]
    fn test_jacobian_unit_cube() {
        let (min_d, max_d, ok) = solid_shell_check_jacobian(&unit_cube());
        assert!(ok);
        assert!((min_d - 0.125).abs() < 1e-12); // det = (1/2)³ = 0.125
        assert!((max_d - 0.125).abs() < 1e-12);
    }

    /// Without ANS, the covariant route T(J⁻¹)·B_cov is the standard Cartesian B.
    #[test]
    fn test_covariant_b_matches_cartesian() {
        let coords = [
            [0.1, -0.2, 0.0], [2.0, 0.1, 0.3], [2.3, 1.2, 0.2], [-0.1, 0.9, -0.1],
            [0.2, -0.1, 0.4], [2.1, 0.0, 0.6], [2.2, 1.3, 0.5], [0.0, 1.0, 0.3],
        ];
        for &(xi, eta, zeta, _) in &gauss_2x2x2() {
            let dn = shape_derivatives_hex8(xi, eta, zeta);
            let (j, ji, _) = jacobian_3d(&coords, &dn);
            let bc = covariant_b_matrix(&j, &dn);
            let t = covariant_to_cartesian(&ji);
            let b = build_b_matrix(&physical_derivatives(&ji, &dn));
            for r in 0..6 {
                for col in 0..24 {
                    let v: f64 = (0..6).map(|p| t[r * 6 + p] * bc[p * 24 + col]).sum();
                    assert!((v - b[r * 24 + col]).abs() < 1e-12, "B[{r},{col}]: {v} vs {}", b[r * 24 + col]);
                }
            }
        }
    }

    /// EAS orthogonality on a distorted, tilted element (a flat, distorted quad extruded
    /// along its normal — the geometry on which the ANS fields reproduce constant strain
    /// exactly): every linear displacement field (constant strain, and rigid rotations)
    /// leaves the enhanced parameters at zero, so the patch test and the rigid-body modes
    /// are untouched by the enhancement.
    #[test]
    fn test_eas_inactive_for_linear_fields() {
        // Plan quad in the plane spanned by e1, e2 (tilted), thickness 0.1 along n = e1 × e2.
        let e1 = [2.0 / 5f64.sqrt(), -1.0 / 5f64.sqrt(), 0.0];
        let n = [1.0 / 14f64.sqrt(), 2.0 / 14f64.sqrt(), 3.0 / 14f64.sqrt()];
        let e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
        let plan = [[0.0, 0.0], [2.0, 0.3], [2.4, 1.5], [-0.2, 1.1]];
        let coords: [[f64; 3]; 8] = std::array::from_fn(|i| {
            let (p, z) = (plan[i % 4], 0.1 * (i / 4) as f64);
            std::array::from_fn(|a| 1.0 + p[0] * e1[a] + p[1] * e2[a] + z * n[a])
        });
        let c = material_matrix_3d(200.0e3, 0.3);
        let ops = eas_operators(&coords, &c);
        for comp in 0..9 {
            let (i, j) = (comp / 3, comp % 3);
            let u: Vec<f64> = (0..24).map(|k| if k % 3 == i { 1e-3 * coords[k / 3][j] } else { 0.0 }).collect();
            let alpha = eas_alpha(&ops, &u);
            // Scale: the strain a single mode would need to matter, 1e-3.
            for a in alpha {
                assert!(a.abs() < 1e-14, "du{i}/dx{j}: α = {a:e}");
            }
        }
    }

    /// The condensed stiffness is no stiffer than the ANS-only one: K_uα K_αα⁻¹ K_αu ⪰ 0.
    /// For a pure-bending field (u = −κxz, ν = 0.3) it is strictly softer, by the Poisson
    /// thickness locking factor.
    #[test]
    fn test_eas_softens_bending() {
        let coords = [
            [0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 1.0, 0.0], [0.0, 1.0, 0.0],
            [0.0, 0.0, 0.05], [1.0, 0.0, 0.05], [1.0, 1.0, 0.05], [0.0, 1.0, 0.05],
        ];
        let c = material_matrix_3d(200.0e3, 0.3);
        let ops = eas_operators(&coords, &c);
        let k = solid_shell_stiffness(&coords, 200.0e3, 0.3);
        let u: Vec<f64> = (0..24).map(|k| match k % 3 {
            0 => -(coords[k / 3][0]) * (coords[k / 3][2] - 0.025),
            2 => 0.5 * coords[k / 3][0].powi(2),
            _ => 0.0,
        }).collect();
        let quad = |m: &[f64]| -> f64 { (0..24).map(|i| u[i] * (0..24).map(|j| m[i * 24 + j] * u[j]).sum::<f64>()).sum() };
        let (e_ans, e_eas) = (quad(&ops.k_uu), quad(&k));
        assert!(e_eas < e_ans && e_eas > 0.0, "{e_eas} vs {e_ans}");
        // v = 0 everywhere: cylindrical (plane-strain) bending, where the ANS-only element has
        // the constrained modulus E(1 − ν)/((1 + ν)(1 − 2ν)) and the EAS element the plate
        // modulus E/(1 − ν²): energy ratio (1 − 2ν)/(1 − ν)² = 0.8163 at ν = 0.3.
        let ratio = e_eas / e_ans;
        let expected = (1.0 - 2.0 * 0.3) / (0.7_f64 * 0.7);
        assert!((ratio - expected).abs() < 1e-9, "energy ratio {ratio} vs {expected}");
    }

    /// The centroid fast path (G = 0 there, so no α solve) equals the full ANS + EAS path
    /// to round-off, for a general displacement on a distorted, warped element.
    #[test]
    fn test_centroid_strain_fast_path_matches_full() {
        let coords = [
            [0.1, -0.2, 0.0], [2.0, 0.1, 0.3], [2.3, 1.2, 0.2], [-0.1, 0.9, -0.1],
            [0.2, -0.1, 0.4], [2.1, 0.0, 0.6], [2.2, 1.3, 0.5], [0.0, 1.0, 0.3],
        ];
        let (e, nu) = (200.0e3, 0.3);
        let u: Vec<f64> = (0..24).map(|k| 1e-3 * ((k * 7 % 11) as f64 - 5.0) * (1.0 + 0.1 * k as f64)).collect();
        let c = material_matrix_3d(e, nu);
        let alpha = eas_alpha(&eas_operators(&coords, &c), &u);
        assert!(alpha.iter().any(|a| a.abs() > 1e-12), "test needs active EAS modes: {alpha:?}");
        let full = strain_with_alpha(&coords, &u, &alpha, 0.0, 0.0, 0.0);
        let fast = solid_shell_strain(&coords, &u, e, nu, 0.0, 0.0, 0.0);
        let scale = full.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
        for r in 0..6 {
            assert!((full[r] - fast[r]).abs() <= 1e-12 * scale, "component {r}: {} vs {}", fast[r], full[r]);
        }
        // Off the centroid the enhanced part is real and the full path is taken.
        let off = solid_shell_strain(&coords, &u, e, nu, 0.3, -0.2, 0.5);
        let ans_only = ans_strain(&coords, &u, 0.3, -0.2, 0.5);
        assert!((0..6).any(|r| (off[r] - ans_only[r]).abs() > 1e-9 * scale));
    }

    /// Perf guard for the centroid recovery (compute_quad_stresses, geometric-stiffness
    /// prestress): it must cost a small fraction of a stiffness evaluation. Through the full
    /// EAS path it cost MORE than one (8-point blocks + α solve), >20× the fast path.
    #[test]
    fn test_centroid_stress_is_cheap() {
        let coords = unit_cube();
        let u: Vec<f64> = (0..24).map(|k| 1e-3 * k as f64).collect();
        let n = 300;
        let t0 = std::time::Instant::now();
        let mut acc = 0.0;
        for _ in 0..n {
            acc += solid_shell_avg_stress(std::hint::black_box(&coords), &u, 200.0e3, 0.3)[0];
        }
        let t_stress = t0.elapsed();
        let t0 = std::time::Instant::now();
        for _ in 0..n {
            acc += solid_shell_stiffness(std::hint::black_box(&coords), 200.0e3, 0.3)[0];
        }
        let t_k = t0.elapsed();
        std::hint::black_box(acc);
        eprintln!("centroid stress {t_stress:?}, stiffness {t_k:?}");
        assert!(t_stress * 4 < t_k, "centroid stress {t_stress:?} vs stiffness {t_k:?} for {n} calls");
    }

    #[test]
    fn test_stiffness_symmetry() {
        let coords = unit_cube();
        let k = solid_shell_stiffness(&coords, 200.0e3, 0.3);
        for i in 0..24 {
            for j in 0..24 {
                let diff = (k[i * 24 + j] - k[j * 24 + i]).abs();
                assert!(diff < 1e-6, "K[{},{}]={} vs K[{},{}]={}", i, j, k[i*24+j], j, i, k[j*24+i]);
            }
        }
    }

    #[test]
    fn test_stiffness_positive_diagonal() {
        let coords = unit_cube();
        let k = solid_shell_stiffness(&coords, 200.0e3, 0.3);
        for i in 0..24 {
            assert!(k[i * 24 + i] > 0.0, "K[{},{}] = {} should be positive", i, i, k[i*24+i]);
        }
    }

    #[test]
    fn test_mass_positive_diagonal() {
        let coords = unit_cube();
        let m = solid_shell_consistent_mass(&coords, 7.85); // steel in tonnes/m³
        for i in 0..24 {
            assert!(m[i * 24 + i] > 0.0, "M[{},{}] = {} should be positive", i, i, m[i*24+i]);
        }
    }

    #[test]
    fn test_mass_total() {
        let coords = unit_cube();
        let rho = 7.85; // tonnes/m³
        let m = solid_shell_consistent_mass(&coords, rho);
        // Total translational mass = ρ·V = 7.85·1 = 7.85
        // Sum all ux-ux entries
        let mut total = 0.0;
        for i in 0..8 {
            for j in 0..8 {
                total += m[(i * 3) * 24 + j * 3];
            }
        }
        assert!((total - rho).abs() < 1e-10, "Total mass = {} vs expected {}", total, rho);
    }

    #[test]
    fn test_pressure_load_unit_cube() {
        let coords = unit_cube();
        let p = 10.0; // kN/m²
        let f = solid_shell_pressure_load(&coords, p);
        // Top face normal is +z for our cube. Pressure pushes inward = -z direction.
        // Total force = p × A = 10 × 1 = 10 kN in -z.
        let total_z: f64 = (0..8).map(|i| f[i * 3 + 2]).sum();
        assert!((total_z + 10.0).abs() < 1e-10, "Total Fz = {} vs expected -10", total_z);
        // x and y totals should be zero
        let total_x: f64 = (0..8).map(|i| f[i * 3]).sum();
        let total_y: f64 = (0..8).map(|i| f[i * 3 + 1]).sum();
        assert!(total_x.abs() < 1e-12, "Total Fx = {}", total_x);
        assert!(total_y.abs() < 1e-12, "Total Fy = {}", total_y);
    }

    #[test]
    fn test_self_weight_load() {
        let coords = unit_cube();
        let rho = 7850.0; // kg/m³
        let f = solid_shell_self_weight_load(&coords, rho, 0.0, 0.0, -9.81);
        let total_z: f64 = (0..8).map(|i| f[i * 3 + 2]).sum();
        let expected = -7850.0 / 1000.0 * 9.81 * 1.0; // -77.0085 kN
        assert!((total_z - expected).abs() < 1e-6, "Total Fz = {} vs expected {}", total_z, expected);
    }
}
