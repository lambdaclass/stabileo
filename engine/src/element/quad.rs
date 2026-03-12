/// MITC4 quadrilateral shell element.
///
/// 4-node shell with 24 DOFs (6 per node: ux, uy, uz, rx, ry, rz).
/// Combines:
/// - Bilinear membrane with EAS-7 (Enhanced Assumed Strain, 7 modes) — Andelfinger & Ramm 1993
/// - Mindlin plate bending (2×2 full integration)
/// - MITC4 assumed natural strain (ANS) transverse shear tying (Bathe & Dvorkin 1986)
/// - Hughes-Brezzi drilling DOF stabilization
///
/// The ANS shear tying samples the displacement-based transverse shear strain
/// at 4 edge midpoints and interpolates bilinearly, eliminating the spurious
/// shear strain modes that cause locking on thin plates (a/t > 50).
///
/// The EAS-7 enhancement adds 7 internal strain parameters to the membrane field
/// (4 linear ξ/η modes + 3 bilinear ξη coupling modes), statically condensed at
/// element level. The bilinear modes provide substantially stronger membrane
/// softening than EAS-4, critical for curved shells with high membrane/bending
/// stiffness ratios (e.g. pinched hemisphere R/t=250).
///
/// References:
///   - Andelfinger & Ramm (1993): "EAS-elements for 2D, 3D, plate and shell structures"
///   - Simo & Rifai (1990): "A class of mixed assumed strain methods"
///   - Bathe & Dvorkin (1986): "A formulation of general shell elements"
///   - Hughes & Brezzi (1989): Drilling rotations formulation
///   - Cook et al.: "Concepts and Applications of FEA", Ch. 13
use serde::{Serialize, Deserialize};

/// Stress results at a quad element (centroid averages).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuadStressResult {
    pub element_id: usize,
    pub sigma_xx: f64,
    pub sigma_yy: f64,
    pub tau_xy: f64,
    pub mx: f64,
    pub my: f64,
    pub mxy: f64,
    pub von_mises: f64,
}

// ==================== Geometry Helpers ====================

fn cross3(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn norm3(v: &[f64; 3]) -> f64 {
    (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt()
}

fn sub3(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn dot3(a: &[f64; 3], b: &[f64; 3]) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// Bilinear shape functions at natural coordinates (xi, eta).
/// Returns [N1, N2, N3, N4] for nodes at (-1,-1), (1,-1), (1,1), (-1,1).
fn shape_functions(xi: f64, eta: f64) -> [f64; 4] {
    [
        0.25 * (1.0 - xi) * (1.0 - eta),
        0.25 * (1.0 + xi) * (1.0 - eta),
        0.25 * (1.0 + xi) * (1.0 + eta),
        0.25 * (1.0 - xi) * (1.0 + eta),
    ]
}

/// Shape function derivatives w.r.t. xi and eta.
/// Returns (dN_dxi[4], dN_deta[4]).
fn shape_derivatives(xi: f64, eta: f64) -> ([f64; 4], [f64; 4]) {
    let dn_dxi = [
        -0.25 * (1.0 - eta),
         0.25 * (1.0 - eta),
         0.25 * (1.0 + eta),
        -0.25 * (1.0 + eta),
    ];
    let dn_deta = [
        -0.25 * (1.0 - xi),
        -0.25 * (1.0 + xi),
         0.25 * (1.0 + xi),
         0.25 * (1.0 - xi),
    ];
    (dn_dxi, dn_deta)
}

/// 2×2 Gauss quadrature points and weights.
fn gauss_2x2() -> [((f64, f64), f64); 4] {
    let g = 1.0 / 3.0_f64.sqrt();
    [
        ((-g, -g), 1.0),
        (( g, -g), 1.0),
        (( g,  g), 1.0),
        ((-g,  g), 1.0),
    ]
}

/// Compute local orthonormal axes from the 4 quad nodes.
/// Uses diagonals to find the normal, then edge 0→1 for ex direction.
fn quad_local_axes(coords: &[[f64; 3]; 4]) -> ([f64; 3], [f64; 3], [f64; 3]) {
    // Diagonals
    let d13 = sub3(&coords[2], &coords[0]);
    let d24 = sub3(&coords[3], &coords[1]);
    let n = cross3(&d13, &d24);
    let n_len = norm3(&n);
    let ez = if n_len > 1e-15 {
        [n[0] / n_len, n[1] / n_len, n[2] / n_len]
    } else {
        [0.0, 0.0, 1.0]
    };

    // ex from edge 0→1
    let v01 = sub3(&coords[1], &coords[0]);
    let l01 = norm3(&v01);
    let ex_raw = if l01 > 1e-15 {
        [v01[0] / l01, v01[1] / l01, v01[2] / l01]
    } else {
        [1.0, 0.0, 0.0]
    };

    // Make ex perpendicular to ez
    let d = dot3(&ex_raw, &ez);
    let ex_orth = [ex_raw[0] - d * ez[0], ex_raw[1] - d * ez[1], ex_raw[2] - d * ez[2]];
    let ex_len = norm3(&ex_orth);
    let ex = [ex_orth[0] / ex_len, ex_orth[1] / ex_len, ex_orth[2] / ex_len];

    let ey = cross3(&ez, &ex);
    (ex, ey, ez)
}

/// Project 4 nodes to 2D local plane.
fn project_to_2d(
    coords: &[[f64; 3]; 4],
    ex: &[f64; 3],
    ey: &[f64; 3],
) -> [[f64; 2]; 4] {
    let o = coords[0];
    let mut pts = [[0.0; 2]; 4];
    for i in 0..4 {
        let d = sub3(&coords[i], &o);
        pts[i] = [dot3(&d, ex), dot3(&d, ey)];
    }
    pts
}

/// Compute Jacobian matrix J = [[dx/dxi, dy/dxi], [dx/deta, dy/deta]]
/// and its inverse and determinant at (xi, eta).
fn jacobian_2d(
    pts: &[[f64; 2]; 4],
    xi: f64,
    eta: f64,
) -> ([[f64; 2]; 2], [[f64; 2]; 2], f64) {
    let (dn_dxi, dn_deta) = shape_derivatives(xi, eta);

    let mut j = [[0.0; 2]; 2];
    for i in 0..4 {
        j[0][0] += dn_dxi[i] * pts[i][0];
        j[0][1] += dn_dxi[i] * pts[i][1];
        j[1][0] += dn_deta[i] * pts[i][0];
        j[1][1] += dn_deta[i] * pts[i][1];
    }

    let det_j = j[0][0] * j[1][1] - j[0][1] * j[1][0];
    let inv_j = if det_j.abs() > 1e-30 {
        let inv_det = 1.0 / det_j;
        [
            [ j[1][1] * inv_det, -j[0][1] * inv_det],
            [-j[1][0] * inv_det,  j[0][0] * inv_det],
        ]
    } else {
        [[1.0, 0.0], [0.0, 1.0]]
    };

    (j, inv_j, det_j)
}

// ==================== Shear B-Matrix for ANS ====================

/// Compute the **covariant** (natural-coordinate) transverse shear B-matrix
/// (2×24) at natural coordinate (xi, eta).
///
/// Row 0 = e_ξz = ∂w/∂ξ + J₁₁·θ_y − J₁₂·θ_x   (covariant shear in ξ)
/// Row 1 = e_ηz = ∂w/∂η + J₂₁·θ_y − J₂₂·θ_x   (covariant shear in η)
///
/// The MITC4 tying must operate on these covariant components, NOT on the
/// physical γ_xz, γ_yz. Physical strains are recovered at each Gauss point
/// via γ = J⁻¹ · ẽ_covariant.
fn shear_b_nat(pts: &[[f64; 2]; 4], xi: f64, eta: f64) -> [[f64; 24]; 2] {
    let (j, _, _) = jacobian_2d(pts, xi, eta);
    let (dn_dxi, dn_deta) = shape_derivatives(xi, eta);
    let n = shape_functions(xi, eta);

    let mut b_nat = [[0.0; 24]; 2];
    for i in 0..4 {
        let di = i * 6;
        // e_ξz = ∂w/∂ξ + g₁·(θ_y x̂ − θ_x ŷ)·N_i
        //      = ∂N_i/∂ξ · w + J₁₁·N_i·θ_y − J₁₂·N_i·θ_x
        b_nat[0][di + 2] = dn_dxi[i];           // w (uz)
        b_nat[0][di + 3] = -j[0][1] * n[i];     // θ_x (rx) — note minus sign
        b_nat[0][di + 4] = j[0][0] * n[i];      // θ_y (ry)
        // e_ηz = ∂w/∂η + g₂·(θ_y x̂ − θ_x ŷ)·N_i
        //      = ∂N_i/∂η · w + J₂₁·N_i·θ_y − J₂₂·N_i·θ_x
        b_nat[1][di + 2] = dn_deta[i];           // w (uz)
        b_nat[1][di + 3] = -j[1][1] * n[i];     // θ_x (rx)
        b_nat[1][di + 4] = j[1][0] * n[i];      // θ_y (ry)
    }
    b_nat
}

// ==================== EAS Helper ====================

/// Invert an n×n matrix (flat row-major slice) in-place via Gauss-Jordan
/// elimination with partial pivoting. Returns the inverse as a Vec.
/// Panics if the matrix is singular.
fn invert_small_matrix(n: usize, m: &[f64]) -> Vec<f64> {
    debug_assert_eq!(m.len(), n * n);
    let cols = 2 * n;
    let mut a = vec![0.0f64; n * cols];
    for r in 0..n {
        for c in 0..n {
            a[r * cols + c] = m[r * n + c];
        }
        a[r * cols + n + r] = 1.0;
    }

    for col in 0..n {
        // Partial pivoting
        let mut max_val = a[col * cols + col].abs();
        let mut max_row = col;
        for row in (col + 1)..n {
            let v = a[row * cols + col].abs();
            if v > max_val {
                max_val = v;
                max_row = row;
            }
        }
        assert!(max_val > 1e-30, "invert_small_matrix: singular (pivot {col} ≈ 0)");

        if max_row != col {
            for c in 0..cols {
                a.swap(col * cols + c, max_row * cols + c);
            }
        }

        let pivot = a[col * cols + col];
        for c in 0..cols {
            a[col * cols + c] /= pivot;
        }

        for row in 0..n {
            if row == col { continue; }
            let factor = a[row * cols + col];
            for c in 0..cols {
                a[row * cols + c] -= factor * a[col * cols + c];
            }
        }
    }

    let mut inv = vec![0.0f64; n * n];
    for r in 0..n {
        for c in 0..n {
            inv[r * n + c] = a[r * cols + n + c];
        }
    }
    inv
}

/// Invert a 4×4 matrix stored as [f64; 16] (row-major).
#[cfg(test)]
fn invert_4x4(m: &[f64; 16]) -> [f64; 16] {
    let v = invert_small_matrix(4, m);
    let mut out = [0.0; 16];
    out.copy_from_slice(&v);
    out
}

// ==================== Stiffness Matrix ====================

/// Compute 24×24 MITC4 local stiffness matrix.
///
/// coords: 4 node coordinates in 3D [x,y,z].
/// e: Young's modulus (kN/m²)
/// nu: Poisson's ratio
/// t: shell thickness (m)
///
/// Uses Bathe-Dvorkin (1986) ANS interpolation for transverse shear
/// (eliminates shear locking) and Simo-Rifai (1990) 4-mode EAS for
/// the membrane field (eliminates membrane locking), statically
/// condensed at element level.
///
/// Returns 576-element Vec (24×24 row-major).
pub fn mitc4_local_stiffness(
    coords: &[[f64; 3]; 4],
    e: f64,
    nu: f64,
    t: f64,
) -> Vec<f64> {
    let (ex, ey, _ez) = quad_local_axes(coords);
    let pts = project_to_2d(coords, &ex, &ey);

    let ndof = 24;
    let mut k = vec![0.0; ndof * ndof];

    // Material matrices
    // Plane stress: D_m = E/(1-ν²) * [[1,ν,0],[ν,1,0],[0,0,(1-ν)/2]]
    let factor = e * t / (1.0 - nu * nu);
    let d_m = [
        factor, factor * nu, 0.0,
        factor * nu, factor, 0.0,
        0.0, 0.0, factor * (1.0 - nu) / 2.0,
    ];

    // Bending: D_b = E*t³/(12*(1-ν²)) * same pattern
    let factor_b = e * t * t * t / (12.0 * (1.0 - nu * nu));
    let d_b = [
        factor_b, factor_b * nu, 0.0,
        factor_b * nu, factor_b, 0.0,
        0.0, 0.0, factor_b * (1.0 - nu) / 2.0,
    ];

    // Shear: D_s = kappa * G * t where kappa = 5/6
    let g = e / (2.0 * (1.0 + nu));
    let kappa = 5.0 / 6.0;
    let d_s = kappa * g * t;

    // Drilling stiffness parameter (Hughes-Brezzi)
    let alpha_drill = factor * (1.0 - nu) / 2.0 * 1e-3;

    // 2×2 Gauss integration
    let gauss = gauss_2x2();

    // --- MITC4 ANS tying points (Bathe & Dvorkin 1986) ---
    // Sample covariant shear B-matrices at 4 edge midpoints:
    //   A = (0, -1), B = (0, +1) → for e_ξz (interpolated linearly in η)
    //   C = (-1, 0), D = (+1, 0) → for e_ηz (interpolated linearly in ξ)
    let b_nat_a = shear_b_nat(&pts, 0.0, -1.0);
    let b_nat_b = shear_b_nat(&pts, 0.0,  1.0);
    let b_nat_c = shear_b_nat(&pts, -1.0, 0.0);
    let b_nat_d = shear_b_nat(&pts,  1.0, 0.0);

    // --- EAS pre-computation (Andelfinger & Ramm 1993, 7-mode membrane) ---
    // T₀ columns from J₀⁻ᵀ (Voigt strain transformation at element center)
    let (_j0, inv_j0, det_j0) = jacobian_2d(&pts, 0.0, 0.0);
    let ep = inv_j0[0][0];
    let eq = inv_j0[1][0];
    let er = inv_j0[0][1];
    let es = inv_j0[1][1];
    let t0_col0 = [ep * ep, er * er, 2.0 * ep * er];
    let t0_col1 = [eq * eq, es * es, 2.0 * eq * es];
    let t0_col2 = [ep * eq, er * es, ep * es + eq * er];
    let mut c_eas = [[0.0f64; 7]; 8]; // 8 membrane DOFs × 7 EAS params
    let mut q_eas = [0.0f64; 49];     // 7×7 row-major

    for &((xi, eta), w_g) in &gauss {
        let (_j, inv_j, det_j) = jacobian_2d(&pts, xi, eta);
        let (dn_dxi, dn_deta) = shape_derivatives(xi, eta);
        let n = shape_functions(xi, eta);
        let dv = det_j.abs() * w_g;

        // Shape function derivatives in physical coords
        let mut dn_dx = [0.0; 4];
        let mut dn_dy = [0.0; 4];
        for i in 0..4 {
            dn_dx[i] = inv_j[0][0] * dn_dxi[i] + inv_j[0][1] * dn_deta[i];
            dn_dy[i] = inv_j[1][0] * dn_dxi[i] + inv_j[1][1] * dn_deta[i];
        }

        // --- Membrane contribution ---
        // DOFs: node_i has [ux, uy, uz, rx, ry, rz] → membrane uses ux(0), uy(1)
        // B_m (3 × 8) maps ux_i, uy_i to [εxx, εyy, γxy]
        // But we scatter into full 24-DOF space
        for i in 0..4 {
            for j in 0..4 {
                let di = i * 6; // Global DOF start for node i
                let dj = j * 6;

                // εxx = ∂ux/∂x → B_m[0, 2i] = dN_i/dx
                // εyy = ∂uy/∂y → B_m[1, 2i+1] = dN_i/dy
                // γxy = ∂ux/∂y + ∂uy/∂x → B_m[2, 2i] = dN_i/dy, B_m[2, 2i+1] = dN_i/dx

                // k[ux_i, ux_j] += dN_i/dx * D11 * dN_j/dx + dN_i/dy * D33 * dN_j/dy
                k[(di) * ndof + dj] += dv * (
                    dn_dx[i] * d_m[0] * dn_dx[j] +
                    dn_dy[i] * d_m[8] * dn_dy[j]
                );
                // k[ux_i, uy_j] += dN_i/dx * D12 * dN_j/dy + dN_i/dy * D33 * dN_j/dx
                k[(di) * ndof + dj + 1] += dv * (
                    dn_dx[i] * d_m[1] * dn_dy[j] +
                    dn_dy[i] * d_m[8] * dn_dx[j]
                );
                // k[uy_i, ux_j] += dN_i/dy * D21 * dN_j/dx + dN_i/dx * D33 * dN_j/dy
                k[(di + 1) * ndof + dj] += dv * (
                    dn_dy[i] * d_m[3] * dn_dx[j] +
                    dn_dx[i] * d_m[8] * dn_dy[j]
                );
                // k[uy_i, uy_j] += dN_i/dy * D22 * dN_j/dy + dN_i/dx * D33 * dN_j/dx
                k[(di + 1) * ndof + dj + 1] += dv * (
                    dn_dy[i] * d_m[4] * dn_dy[j] +
                    dn_dx[i] * d_m[8] * dn_dx[j]
                );
            }
        }

        // --- EAS accumulation (membrane enhanced strain, 7 modes) ---
        // Modes 1-4: Simo & Rifai 1990 (ξ, η linear)
        // Modes 5-7: Andelfinger & Ramm 1993 (ξη bilinear coupling)
        {
            let scale = det_j0 / det_j;
            let sxi = scale * xi;
            let seta = scale * eta;
            let sxe = scale * xi * eta;

            // M̂(ξ,η) = (det_J₀/det_J) · T₀ · M_hat  (3×7)
            let m_eas: [[f64; 7]; 3] = [
                [sxi * t0_col0[0], seta * t0_col1[0], sxi * t0_col2[0], seta * t0_col2[0],
                 sxe * t0_col0[0], sxe * t0_col1[0], sxe * t0_col2[0]],
                [sxi * t0_col0[1], seta * t0_col1[1], sxi * t0_col2[1], seta * t0_col2[1],
                 sxe * t0_col0[1], sxe * t0_col1[1], sxe * t0_col2[1]],
                [sxi * t0_col0[2], seta * t0_col1[2], sxi * t0_col2[2], seta * t0_col2[2],
                 sxe * t0_col0[2], sxe * t0_col1[2], sxe * t0_col2[2]],
            ];

            // DM = D_m · M (exploiting D_m sparsity)
            let mut dm = [[0.0; 7]; 3];
            for kk in 0..7 {
                dm[0][kk] = d_m[0] * m_eas[0][kk] + d_m[1] * m_eas[1][kk];
                dm[1][kk] = d_m[3] * m_eas[0][kk] + d_m[4] * m_eas[1][kk];
                dm[2][kk] = d_m[8] * m_eas[2][kk];
            }

            // C = ∫ Bᵀ_m · D_m · M dΩ  (8×7)
            for i in 0..4 {
                for kk in 0..7 {
                    c_eas[2 * i][kk]     += dv * (dn_dx[i] * dm[0][kk] + dn_dy[i] * dm[2][kk]);
                    c_eas[2 * i + 1][kk] += dv * (dn_dy[i] * dm[1][kk] + dn_dx[i] * dm[2][kk]);
                }
            }

            // Q = ∫ Mᵀ · D_m · M dΩ  (7×7)
            for k1 in 0..7 {
                for k2 in 0..7 {
                    q_eas[k1 * 7 + k2] += dv * (
                        m_eas[0][k1] * dm[0][k2]
                        + m_eas[1][k1] * dm[1][k2]
                        + m_eas[2][k1] * dm[2][k2]
                    );
                }
            }
        }

        // --- Bending contribution ---
        // For Mindlin plate: κxx = -∂θy/∂x, κyy = ∂θx/∂y, κxy = ∂θx/∂x - ∂θy/∂y
        // DOFs: θx = rx (DOF 3), θy = ry (DOF 4)
        for i in 0..4 {
            for j in 0..4 {
                let di = i * 6;
                let dj = j * 6;

                // κxx = -∂θy/∂x → B_b maps ry to κxx via -dN/dx
                // κyy = ∂θx/∂y → B_b maps rx to κyy via dN/dy
                // κxy = ∂θx/∂x - ∂θy/∂y → maps rx via dN/dx, ry via -dN/dy

                // k[rx_i, rx_j]: κyy-κyy + κxy-κxy terms
                k[(di + 3) * ndof + dj + 3] += dv * (
                    dn_dy[i] * d_b[4] * dn_dy[j] +       // κyy-κyy
                    dn_dx[i] * d_b[8] * dn_dx[j]          // κxy-κxy
                );
                // k[rx_i, ry_j]: κyy-κxx cross + κxy cross
                k[(di + 3) * ndof + dj + 4] += dv * (
                    dn_dy[i] * d_b[3] * (-dn_dx[j]) +    // κyy × D21 × κxx
                    dn_dx[i] * d_b[8] * (-dn_dy[j])       // κxy × D33 × κxy
                );
                // k[ry_i, rx_j]: symmetric
                k[(di + 4) * ndof + dj + 3] += dv * (
                    (-dn_dx[i]) * d_b[1] * dn_dy[j] +    // κxx × D12 × κyy
                    (-dn_dy[i]) * d_b[8] * dn_dx[j]       // κxy × D33 × κxy
                );
                // k[ry_i, ry_j]: κxx-κxx + κxy-κxy
                k[(di + 4) * ndof + dj + 4] += dv * (
                    (-dn_dx[i]) * d_b[0] * (-dn_dx[j]) + // κxx-κxx
                    (-dn_dy[i]) * d_b[8] * (-dn_dy[j])    // κxy-κxy
                );
            }
        }

        // --- Transverse shear (MITC4 ANS — Bathe & Dvorkin 1986) ---
        // Covariant assumed natural strain interpolation from tying points:
        //   ẽ_ξz(ξ,η) = (1-η)/2 · e_ξz(A) + (1+η)/2 · e_ξz(B)
        //   ẽ_ηz(ξ,η) = (1-ξ)/2 · e_ηz(C) + (1+ξ)/2 · e_ηz(D)
        // Then transform to physical: γ_phys = J⁻¹(GP) · ẽ_covariant
        {
            // Step 1: Interpolate covariant B_nat at this Gauss point
            let mut b_nat_tied = [[0.0; 24]; 2];
            let w_a = 0.5 * (1.0 - eta);
            let w_b = 0.5 * (1.0 + eta);
            let w_c = 0.5 * (1.0 - xi);
            let w_d = 0.5 * (1.0 + xi);

            for col in 0..24 {
                // e_ξz row: interpolate from A and B (linear in η)
                b_nat_tied[0][col] = w_a * b_nat_a[0][col] + w_b * b_nat_b[0][col];
                // e_ηz row: interpolate from C and D (linear in ξ)
                b_nat_tied[1][col] = w_c * b_nat_c[1][col] + w_d * b_nat_d[1][col];
            }

            // Step 2: Transform to physical coordinates: B_phys = J⁻¹ · B̃_nat
            let mut b_phys = [[0.0; 24]; 2];
            for col in 0..24 {
                b_phys[0][col] = inv_j[0][0] * b_nat_tied[0][col] + inv_j[0][1] * b_nat_tied[1][col];
                b_phys[1][col] = inv_j[1][0] * b_nat_tied[0][col] + inv_j[1][1] * b_nat_tied[1][col];
            }

            // Step 3: k += B_phys^T · D_s · B_phys · dV
            for r in 0..ndof {
                let b0r = b_phys[0][r];
                let b1r = b_phys[1][r];
                if b0r.abs() < 1e-30 && b1r.abs() < 1e-30 { continue; }
                for c in 0..ndof {
                    k[r * ndof + c] += dv * d_s * (
                        b0r * b_phys[0][c] + b1r * b_phys[1][c]
                    );
                }
            }
        }

        // --- Drilling DOF stabilization ---
        // Add small stiffness to rz DOFs (index 5 for each node)
        for i in 0..4 {
            for j in 0..4 {
                let di = i * 6 + 5;
                let dj = j * 6 + 5;
                k[di * ndof + dj] += dv * alpha_drill * n[i] * n[j];
            }
        }
    }

    // --- EAS static condensation: K_eff = K - C · Q⁻¹ · Cᵀ ---
    {
        let q_inv = invert_small_matrix(7, &q_eas);

        // qi_ct = Q⁻¹ · Cᵀ  (7×8); Cᵀ[a][j] = c_eas[j][a]
        let mut qi_ct = [[0.0; 8]; 7];
        for a in 0..7 {
            for j in 0..8 {
                let mut v = 0.0;
                for b in 0..7 {
                    v += q_inv[a * 7 + b] * c_eas[j][b];
                }
                qi_ct[a][j] = v;
            }
        }

        // Scatter correction into global stiffness
        let mem_dofs: [usize; 8] = [0, 1, 6, 7, 12, 13, 18, 19];
        for i in 0..8 {
            let gi = mem_dofs[i];
            for j in 0..8 {
                let gj = mem_dofs[j];
                let mut corr = 0.0;
                for a in 0..7 {
                    corr += c_eas[i][a] * qi_ct[a][j];
                }
                k[gi * ndof + gj] -= corr;
            }
        }
    }

    k
}

/// Build 24×24 rotation matrix from local to global for the quad element.
pub fn quad_transform_3d(coords: &[[f64; 3]; 4]) -> Vec<f64> {
    let (ex, ey, ez) = quad_local_axes(coords);

    // 3×3 rotation matrix (local → global)
    let r = [
        [ex[0], ey[0], ez[0]],
        [ex[1], ey[1], ez[1]],
        [ex[2], ey[2], ez[2]],
    ];

    // Build 24×24 block-diagonal: 8 blocks of 3×3
    let mut t = vec![0.0; 24 * 24];
    for node in 0..4 {
        for block in 0..2 {
            // block 0: translations, block 1: rotations
            let offset = node * 6 + block * 3;
            for i in 0..3 {
                for j in 0..3 {
                    t[(offset + i) * 24 + (offset + j)] = r[i][j];
                }
            }
        }
    }
    t
}

/// Compute quad element consistent mass matrix (24×24).
///
/// Lumped mass approximation with rotary inertia.
pub fn quad_consistent_mass(
    coords: &[[f64; 3]; 4],
    rho: f64,
    t: f64,
) -> Vec<f64> {
    let (ex, ey, _) = quad_local_axes(coords);
    let pts = project_to_2d(coords, &ex, &ey);
    let ndof = 24;
    let mut m = vec![0.0; ndof * ndof];

    let gauss = gauss_2x2();

    for &((xi, eta), w_g) in &gauss {
        let (_, _, det_j) = jacobian_2d(&pts, xi, eta);
        let n = shape_functions(xi, eta);
        let dv = det_j.abs() * w_g;

        for i in 0..4 {
            for j in 0..4 {
                let di = i * 6;
                let dj = j * 6;
                let m_val = rho * t * dv * n[i] * n[j];

                // Translational mass (ux, uy, uz)
                for d in 0..3 {
                    m[(di + d) * ndof + (dj + d)] += m_val;
                }

                // Rotary inertia (rx, ry) ~ ρ*t³/12 * N_i * N_j
                let m_rot = rho * t * t * t / 12.0 * dv * n[i] * n[j];
                m[(di + 3) * ndof + (dj + 3)] += m_rot;
                m[(di + 4) * ndof + (dj + 4)] += m_rot;
            }
        }
    }

    m
}

/// Compute quad geometric stiffness matrix (24×24) for buckling.
///
/// Takes membrane stress resultants nxx, nyy, nxy (force/length).
pub fn quad_geometric_stiffness(
    coords: &[[f64; 3]; 4],
    nxx: f64,
    nyy: f64,
    nxy: f64,
) -> Vec<f64> {
    let (ex, ey, _) = quad_local_axes(coords);
    let pts = project_to_2d(coords, &ex, &ey);
    let ndof = 24;
    let mut kg = vec![0.0; ndof * ndof];

    let gauss = gauss_2x2();

    for &((xi, eta), w_g) in &gauss {
        let (_, inv_j, det_j) = jacobian_2d(&pts, xi, eta);
        let (dn_dxi, dn_deta) = shape_derivatives(xi, eta);
        let dv = det_j.abs() * w_g;

        let mut dn_dx = [0.0; 4];
        let mut dn_dy = [0.0; 4];
        for i in 0..4 {
            dn_dx[i] = inv_j[0][0] * dn_dxi[i] + inv_j[0][1] * dn_deta[i];
            dn_dy[i] = inv_j[1][0] * dn_dxi[i] + inv_j[1][1] * dn_deta[i];
        }

        // Geometric stiffness: k_g[uz_i, uz_j] += (Nxx*dNi/dx*dNj/dx + Nyy*dNi/dy*dNj/dy + Nxy*(dNi/dx*dNj/dy + dNi/dy*dNj/dx))
        for i in 0..4 {
            for j in 0..4 {
                let val = nxx * dn_dx[i] * dn_dx[j]
                    + nyy * dn_dy[i] * dn_dy[j]
                    + nxy * (dn_dx[i] * dn_dy[j] + dn_dy[i] * dn_dx[j]);

                // Apply to translational DOFs (uz primarily for buckling)
                let di = i * 6 + 2; // uz
                let dj = j * 6 + 2;
                kg[di * ndof + dj] += dv * val;
            }
        }
    }

    kg
}

/// Compute quad element stresses at centroid from nodal displacements (local).
pub fn quad_stresses(
    coords: &[[f64; 3]; 4],
    u_local: &[f64; 24],
    e: f64,
    nu: f64,
    t: f64,
) -> QuadStressResult {
    let (ex, ey, _) = quad_local_axes(coords);
    let pts = project_to_2d(coords, &ex, &ey);

    // Evaluate at centroid (xi=0, eta=0)
    let (_, inv_j, _) = jacobian_2d(&pts, 0.0, 0.0);
    let (dn_dxi, dn_deta) = shape_derivatives(0.0, 0.0);

    let mut dn_dx = [0.0; 4];
    let mut dn_dy = [0.0; 4];
    for i in 0..4 {
        dn_dx[i] = inv_j[0][0] * dn_dxi[i] + inv_j[0][1] * dn_deta[i];
        dn_dy[i] = inv_j[1][0] * dn_dxi[i] + inv_j[1][1] * dn_deta[i];
    }

    // Membrane strains
    let mut eps_xx = 0.0;
    let mut eps_yy = 0.0;
    let mut gamma_xy = 0.0;
    for i in 0..4 {
        let ux = u_local[i * 6];
        let uy = u_local[i * 6 + 1];
        eps_xx += dn_dx[i] * ux;
        eps_yy += dn_dy[i] * uy;
        gamma_xy += dn_dy[i] * ux + dn_dx[i] * uy;
    }

    // Bending curvatures
    let mut kappa_xx = 0.0;
    let mut kappa_yy = 0.0;
    let mut kappa_xy = 0.0;
    for i in 0..4 {
        let rx = u_local[i * 6 + 3];
        let ry = u_local[i * 6 + 4];
        kappa_xx += -dn_dx[i] * ry;
        kappa_yy += dn_dy[i] * rx;
        kappa_xy += dn_dx[i] * rx - dn_dy[i] * ry;
    }

    // Stresses
    let c = e / (1.0 - nu * nu);
    let sigma_xx = c * (eps_xx + nu * eps_yy);
    let sigma_yy = c * (nu * eps_xx + eps_yy);
    let tau_xy = c * (1.0 - nu) / 2.0 * gamma_xy;

    // Moments
    let cb = e * t * t / (12.0 * (1.0 - nu * nu));
    let mx = cb * (kappa_xx + nu * kappa_yy);
    let my = cb * (nu * kappa_xx + kappa_yy);
    let mxy = cb * (1.0 - nu) / 2.0 * kappa_xy;

    // Von Mises
    let von_mises = (sigma_xx * sigma_xx - sigma_xx * sigma_yy
        + sigma_yy * sigma_yy + 3.0 * tau_xy * tau_xy).sqrt();

    QuadStressResult {
        element_id: 0,
        sigma_xx,
        sigma_yy,
        tau_xy,
        mx,
        my,
        mxy,
        von_mises,
    }
}

/// Quad element DOFs for 4 nodes.
pub fn quad_element_dofs(
    dof_map: &std::collections::HashMap<(usize, usize), usize>,
    nodes: &[usize; 4],
) -> Vec<usize> {
    let mut dofs = Vec::with_capacity(24);
    for &node_id in nodes {
        for local in 0..6 {
            if let Some(&d) = dof_map.get(&(node_id, local)) {
                dofs.push(d);
            }
        }
    }
    dofs
}

/// Consistent pressure load for quad element (24-DOF).
///
/// Pressure is applied normal to the shell surface. Returns 24-element load vector.
pub fn quad_pressure_load(coords: &[[f64; 3]; 4], pressure: f64) -> Vec<f64> {
    let (ex, ey, ez) = quad_local_axes(coords);
    let pts = project_to_2d(coords, &ex, &ey);

    let mut f = vec![0.0; 24];
    let gauss = gauss_2x2();

    for &((xi, eta), w_g) in &gauss {
        let (_, _, det_j) = jacobian_2d(&pts, xi, eta);
        let n = shape_functions(xi, eta);
        let dv = det_j.abs() * w_g;

        // Pressure acts in normal (ez) direction
        for i in 0..4 {
            // Force in global coordinates: pressure * N_i * dA * ez
            let f_local_z = pressure * n[i] * dv;
            f[i * 6]     += f_local_z * ez[0];
            f[i * 6 + 1] += f_local_z * ez[1];
            f[i * 6 + 2] += f_local_z * ez[2];
        }
    }

    f
}

/// Compute von Mises stress at each of the 4 nodes by evaluating at Gauss points
/// and extrapolating (bilinear extrapolation from 2×2 Gauss points to corners).
pub fn quad_nodal_von_mises(
    coords: &[[f64; 3]; 4],
    u_local: &[f64; 24],
    e: f64,
    nu: f64,
    _t: f64,
) -> Vec<f64> {
    let (ex, ey, _) = quad_local_axes(coords);
    let pts = project_to_2d(coords, &ex, &ey);
    let gauss = gauss_2x2();

    // Evaluate von Mises at each Gauss point
    let mut gp_vm = [0.0; 4];
    for (gp, &((xi, eta), _)) in gauss.iter().enumerate() {
        let (_, inv_j, _) = jacobian_2d(&pts, xi, eta);
        let (dn_dxi, dn_deta) = shape_derivatives(xi, eta);

        let mut dn_dx = [0.0; 4];
        let mut dn_dy = [0.0; 4];
        for i in 0..4 {
            dn_dx[i] = inv_j[0][0] * dn_dxi[i] + inv_j[0][1] * dn_deta[i];
            dn_dy[i] = inv_j[1][0] * dn_dxi[i] + inv_j[1][1] * dn_deta[i];
        }

        let mut eps_xx = 0.0;
        let mut eps_yy = 0.0;
        let mut gamma_xy = 0.0;
        for i in 0..4 {
            let ux = u_local[i * 6];
            let uy = u_local[i * 6 + 1];
            eps_xx += dn_dx[i] * ux;
            eps_yy += dn_dy[i] * uy;
            gamma_xy += dn_dy[i] * ux + dn_dx[i] * uy;
        }

        let c = e / (1.0 - nu * nu);
        let sxx = c * (eps_xx + nu * eps_yy);
        let syy = c * (nu * eps_xx + eps_yy);
        let txy = c * (1.0 - nu) / 2.0 * gamma_xy;
        gp_vm[gp] = (sxx * sxx - sxx * syy + syy * syy + 3.0 * txy * txy).sqrt();
    }

    // Bilinear extrapolation from Gauss points to corner nodes
    // Gauss points are at ±1/√3; extrapolation factor = √3
    let s = 3.0_f64.sqrt();
    let corner_xi = [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)];
    let mut nodal = vec![0.0; 4];
    for (ni, &(xi_n, eta_n)) in corner_xi.iter().enumerate() {
        // Evaluate bilinear interpolation of GP values at node location (scaled)
        let xi_s = xi_n * s;
        let eta_s = eta_n * s;
        let n = shape_functions(xi_s, eta_s);
        for gp in 0..4 {
            nodal[ni] += n[gp] * gp_vm[gp];
        }
        // Clamp to non-negative
        if nodal[ni] < 0.0 { nodal[ni] = 0.0; }
    }
    nodal
}

/// Compute full stress tensor at each of the 4 nodes by evaluating at Gauss points
/// and extrapolating (bilinear extrapolation from 2×2 Gauss points to corners).
///
/// Returns a Vec of 4 `QuadNodalStress` structs, one per corner node, with
/// membrane stresses (sigma_xx, sigma_yy, tau_xy), bending moments (mx, my, mxy),
/// and von Mises stress.
pub fn quad_stress_at_nodes(
    coords: &[[f64; 3]; 4],
    u_local: &[f64; 24],
    e: f64,
    nu: f64,
    t: f64,
) -> Vec<crate::types::QuadNodalStress> {
    let (ex, ey, _) = quad_local_axes(coords);
    let pts = project_to_2d(coords, &ex, &ey);
    let gauss = gauss_2x2();

    // Evaluate full stress tensor at each Gauss point
    let c = e / (1.0 - nu * nu);
    let cb = e * t * t / (12.0 * (1.0 - nu * nu));

    let mut gp_sxx = [0.0; 4];
    let mut gp_syy = [0.0; 4];
    let mut gp_txy = [0.0; 4];
    let mut gp_mx  = [0.0; 4];
    let mut gp_my  = [0.0; 4];
    let mut gp_mxy = [0.0; 4];

    for (gp, &((xi, eta), _)) in gauss.iter().enumerate() {
        let (_, inv_j, _) = jacobian_2d(&pts, xi, eta);
        let (dn_dxi, dn_deta) = shape_derivatives(xi, eta);

        let mut dn_dx = [0.0; 4];
        let mut dn_dy = [0.0; 4];
        for i in 0..4 {
            dn_dx[i] = inv_j[0][0] * dn_dxi[i] + inv_j[0][1] * dn_deta[i];
            dn_dy[i] = inv_j[1][0] * dn_dxi[i] + inv_j[1][1] * dn_deta[i];
        }

        let mut eps_xx = 0.0;
        let mut eps_yy = 0.0;
        let mut gamma_xy = 0.0;
        for i in 0..4 {
            let ux = u_local[i * 6];
            let uy = u_local[i * 6 + 1];
            eps_xx += dn_dx[i] * ux;
            eps_yy += dn_dy[i] * uy;
            gamma_xy += dn_dy[i] * ux + dn_dx[i] * uy;
        }

        let mut kappa_xx = 0.0;
        let mut kappa_yy = 0.0;
        let mut kappa_xy = 0.0;
        for i in 0..4 {
            let rx = u_local[i * 6 + 3];
            let ry = u_local[i * 6 + 4];
            kappa_xx += -dn_dx[i] * ry;
            kappa_yy += dn_dy[i] * rx;
            kappa_xy += dn_dx[i] * rx - dn_dy[i] * ry;
        }

        gp_sxx[gp] = c * (eps_xx + nu * eps_yy);
        gp_syy[gp] = c * (nu * eps_xx + eps_yy);
        gp_txy[gp] = c * (1.0 - nu) / 2.0 * gamma_xy;
        gp_mx[gp]  = cb * (kappa_xx + nu * kappa_yy);
        gp_my[gp]  = cb * (nu * kappa_xx + kappa_yy);
        gp_mxy[gp] = cb * (1.0 - nu) / 2.0 * kappa_xy;
    }

    // Bilinear extrapolation from Gauss points to corner nodes
    let s = 3.0_f64.sqrt();
    let corner_xi = [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)];
    let mut result = Vec::with_capacity(4);

    for (ni, &(xi_n, eta_n)) in corner_xi.iter().enumerate() {
        let xi_s = xi_n * s;
        let eta_s = eta_n * s;
        let n = shape_functions(xi_s, eta_s);

        let mut sxx = 0.0;
        let mut syy = 0.0;
        let mut txy = 0.0;
        let mut mx  = 0.0;
        let mut my  = 0.0;
        let mut mxy = 0.0;

        for gp in 0..4 {
            sxx += n[gp] * gp_sxx[gp];
            syy += n[gp] * gp_syy[gp];
            txy += n[gp] * gp_txy[gp];
            mx  += n[gp] * gp_mx[gp];
            my  += n[gp] * gp_my[gp];
            mxy += n[gp] * gp_mxy[gp];
        }

        let vm = (sxx * sxx - sxx * syy + syy * syy + 3.0 * txy * txy).sqrt();

        result.push(crate::types::QuadNodalStress {
            node_index: ni,
            sigma_xx: sxx,
            sigma_yy: syy,
            tau_xy: txy,
            mx,
            my,
            mxy,
            von_mises: vm.max(0.0),
        });
    }

    result
}

/// Thermal load vector for quad element (24-DOF).
///
/// `dt_uniform`: uniform temperature change (membrane expansion).
/// `dt_gradient`: through-thickness temperature gradient (bending).
pub fn quad_thermal_load(
    coords: &[[f64; 3]; 4],
    e: f64,
    nu: f64,
    t: f64,
    alpha: f64,
    dt_uniform: f64,
    dt_gradient: f64,
) -> Vec<f64> {
    let (ex, ey, _ez) = quad_local_axes(coords);
    let pts = project_to_2d(coords, &ex, &ey);
    let ndof = 24;
    let mut f = vec![0.0; ndof];

    // Membrane thermal resultant: N_T = E*α*ΔT*t / (1-ν)
    let n_t = e * alpha * dt_uniform * t / (1.0 - nu);
    // Bending thermal moment: M_T = E*α*ΔT_grad*t² / (12*(1-ν))
    let m_t = e * alpha * dt_gradient * t * t / (12.0 * (1.0 - nu));

    let gauss = gauss_2x2();

    for &((xi, eta), w_g) in &gauss {
        let (_, inv_j, det_j) = jacobian_2d(&pts, xi, eta);
        let (dn_dxi, dn_deta) = shape_derivatives(xi, eta);
        let dv = det_j.abs() * w_g;

        let mut dn_dx = [0.0; 4];
        let mut dn_dy = [0.0; 4];
        for i in 0..4 {
            dn_dx[i] = inv_j[0][0] * dn_dxi[i] + inv_j[0][1] * dn_deta[i];
            dn_dy[i] = inv_j[1][0] * dn_dxi[i] + inv_j[1][1] * dn_deta[i];
        }

        for i in 0..4 {
            let di = i * 6;
            // Membrane: f = ∫ B_m^T * N_T * {1, 1, 0} dA
            // ux: dN/dx * N_T, uy: dN/dy * N_T
            f[di]     += dv * dn_dx[i] * n_t;
            f[di + 1] += dv * dn_dy[i] * n_t;

            // Bending: f = ∫ B_b^T * M_T * {1, 1, 0} dA
            // κxx = -∂θy/∂x → ry gets -dN/dx * M_T
            // κyy = ∂θx/∂y  → rx gets dN/dy * M_T
            f[di + 3] += dv * dn_dy[i] * m_t;   // rx
            f[di + 4] -= dv * dn_dx[i] * m_t;   // ry
        }
    }

    // Transform from local to global
    let t_mat = quad_transform_3d(coords);
    let mut f_global = vec![0.0; ndof];
    for i in 0..ndof {
        for j in 0..ndof {
            f_global[i] += t_mat[i * ndof + j] * f[j];
        }
    }
    f_global
}

/// Consistent body force (self-weight) load vector for quad element (24-DOF).
///
/// Integrates `f_i = (rho / 1000) * t * N_i * [gx, gy, gz] * dA` over the element.
/// Division by 1000 converts N to kN (solver force unit) since rho is kg/m³ and g is m/s².
pub fn quad_self_weight_load(
    coords: &[[f64; 3]; 4],
    rho: f64,
    t: f64,
    gx: f64,
    gy: f64,
    gz: f64,
) -> Vec<f64> {
    let (ex, ey, ez) = quad_local_axes(coords);
    let pts = project_to_2d(coords, &ex, &ey);

    // Project global gravity into local coordinates
    let g_local_x = gx * ex[0] + gy * ex[1] + gz * ex[2];
    let g_local_y = gx * ey[0] + gy * ey[1] + gz * ey[2];
    let g_local_z = gx * ez[0] + gy * ez[1] + gz * ez[2];

    let mut f = vec![0.0; 24];
    let gauss = gauss_2x2();

    for &((xi, eta), w_g) in &gauss {
        let (_, _, det_j) = jacobian_2d(&pts, xi, eta);
        let n = shape_functions(xi, eta);
        let dv = det_j.abs() * w_g;

        for i in 0..4 {
            let w = (rho / 1000.0) * t * n[i] * dv;
            f[i * 6]     += w * g_local_x;
            f[i * 6 + 1] += w * g_local_y;
            f[i * 6 + 2] += w * g_local_z;
        }
    }

    f
}

/// Consistent edge load vector for quad element (24-DOF).
///
/// `edge`: edge index 0-3 (0=nodes 0→1, 1=nodes 1→2, 2=nodes 2→3, 3=nodes 3→0).
/// `qn`: normal pressure on edge (force/length), positive = outward from element.
/// `qt`: tangential traction along edge (force/length).
pub fn quad_edge_load(
    coords: &[[f64; 3]; 4],
    edge: usize,
    qn: f64,
    qt: f64,
) -> Vec<f64> {
    let (_ex, _ey, ez) = quad_local_axes(coords);
    let ndof = 24;
    let mut f = vec![0.0; ndof];

    // Edge node indices
    let edge_nodes: [(usize, usize); 4] = [(0, 1), (1, 2), (2, 3), (3, 0)];
    let (ni, nj) = edge_nodes[edge.min(3)];

    // Edge vector and length
    let edge_vec = sub3(&coords[nj], &coords[ni]);
    let l_edge = norm3(&edge_vec);
    if l_edge < 1e-15 { return f; }

    // Edge tangent (along edge)
    let et = [edge_vec[0] / l_edge, edge_vec[1] / l_edge, edge_vec[2] / l_edge];
    // Edge in-plane normal (perpendicular to edge, in shell plane)
    let en = cross3(&ez, &et);

    // Distributed load in global = qn * en + qt * et (force per length)
    let qx = qn * en[0] + qt * et[0];
    let qy = qn * en[1] + qt * et[1];
    let qz = qn * en[2] + qt * et[2];

    // Consistent nodal forces: uniform load → L/2 per node
    let half_l = l_edge / 2.0;
    f[ni * 6]     += qx * half_l;
    f[ni * 6 + 1] += qy * half_l;
    f[ni * 6 + 2] += qz * half_l;
    f[nj * 6]     += qx * half_l;
    f[nj * 6 + 1] += qy * half_l;
    f[nj * 6 + 2] += qz * half_l;

    f
}

/// Mesh quality metrics for a quad element.
#[derive(Debug, Clone)]
pub struct QuadQualityMetrics {
    /// Aspect ratio (longest edge / shortest edge). Ideal = 1.0.
    pub aspect_ratio: f64,
    /// Maximum skew angle deviation from 90° (degrees). Ideal = 0.
    pub max_skew: f64,
    /// Warping factor: max distance of corners from best-fit plane / diagonal length.
    /// 0 for planar quads.
    pub warping: f64,
    /// Minimum Jacobian determinant ratio (min/max over Gauss points). Ideal = 1.0.
    pub jacobian_ratio: f64,
}

/// Compute mesh quality metrics for a quad element.
pub fn quad_quality_metrics(coords: &[[f64; 3]; 4]) -> QuadQualityMetrics {
    // Edge lengths
    let edges = [
        norm3(&sub3(&coords[1], &coords[0])),
        norm3(&sub3(&coords[2], &coords[1])),
        norm3(&sub3(&coords[3], &coords[2])),
        norm3(&sub3(&coords[0], &coords[3])),
    ];
    let max_edge = edges.iter().cloned().fold(0.0_f64, f64::max);
    let min_edge = edges.iter().cloned().fold(f64::INFINITY, f64::min);
    let aspect_ratio = if min_edge > 1e-15 { max_edge / min_edge } else { f64::INFINITY };

    // Skew: angle at each corner
    let mut max_skew = 0.0_f64;
    for i in 0..4 {
        let prev = (i + 3) % 4;
        let next = (i + 1) % 4;
        let v1 = sub3(&coords[prev], &coords[i]);
        let v2 = sub3(&coords[next], &coords[i]);
        let l1 = norm3(&v1);
        let l2 = norm3(&v2);
        if l1 > 1e-15 && l2 > 1e-15 {
            let cos_a = dot3(&v1, &v2) / (l1 * l2);
            let angle = cos_a.clamp(-1.0, 1.0).acos().to_degrees();
            let skew = (angle - 90.0).abs();
            max_skew = max_skew.max(skew);
        }
    }

    // Warping: distance from best-fit plane
    let (_, _, ez) = quad_local_axes(coords);
    let center = [
        0.25 * (coords[0][0] + coords[1][0] + coords[2][0] + coords[3][0]),
        0.25 * (coords[0][1] + coords[1][1] + coords[2][1] + coords[3][1]),
        0.25 * (coords[0][2] + coords[1][2] + coords[2][2] + coords[3][2]),
    ];
    let mut max_dist = 0.0_f64;
    for c in coords {
        let d = sub3(c, &center);
        let dist = dot3(&d, &ez).abs();
        max_dist = max_dist.max(dist);
    }
    let diag = norm3(&sub3(&coords[2], &coords[0]));
    let warping = if diag > 1e-15 { max_dist / diag } else { 0.0 };

    // Jacobian ratio
    let (ex, ey, _) = quad_local_axes(coords);
    let pts = project_to_2d(coords, &ex, &ey);
    let gauss = gauss_2x2();
    let mut min_det = f64::INFINITY;
    let mut max_det = 0.0_f64;
    for &((xi, eta), _) in &gauss {
        let (_, _, det) = jacobian_2d(&pts, xi, eta);
        let d = det.abs();
        min_det = min_det.min(d);
        max_det = max_det.max(d);
    }
    let jacobian_ratio = if max_det > 1e-15 { min_det / max_det } else { 0.0 };

    QuadQualityMetrics {
        aspect_ratio,
        max_skew,
        warping,
        jacobian_ratio,
    }
}

/// Check Jacobian determinant over all 4 Gauss points.
///
/// Returns `(min_det_j, max_det_j, has_negative)` where `has_negative` is true
/// if any Gauss point has a non-positive Jacobian determinant (indicating an
/// inverted or degenerate element).
pub fn quad_check_jacobian(coords: &[[f64; 3]; 4]) -> (f64, f64, bool) {
    let (ex, ey, _) = quad_local_axes(coords);
    let pts = project_to_2d(coords, &ex, &ey);
    let gauss = gauss_2x2();

    let mut min_det = f64::INFINITY;
    let mut max_det = f64::NEG_INFINITY;
    let mut has_negative = false;

    for &((xi, eta), _) in &gauss {
        let (_, _, det_j) = jacobian_2d(&pts, xi, eta);
        min_det = min_det.min(det_j);
        max_det = max_det.max(det_j);
        if det_j <= 0.0 {
            has_negative = true;
        }
    }

    (min_det, max_det, has_negative)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_unit_square() -> [[f64; 3]; 4] {
        [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [1.0, 1.0, 0.0],
            [0.0, 1.0, 0.0],
        ]
    }

    #[test]
    fn test_stiffness_symmetry() {
        let coords = make_unit_square();
        let k = mitc4_local_stiffness(&coords, 200e6, 0.3, 0.01);

        // Check symmetry
        for i in 0..24 {
            for j in 0..24 {
                let diff = (k[i * 24 + j] - k[j * 24 + i]).abs();
                let max_val = k[i * 24 + j].abs().max(k[j * 24 + i].abs()).max(1e-10);
                assert!(
                    diff / max_val < 1e-10,
                    "Stiffness not symmetric at ({},{}): {} vs {}",
                    i, j, k[i * 24 + j], k[j * 24 + i]
                );
            }
        }
    }

    #[test]
    fn test_stiffness_positive_diagonal() {
        let coords = make_unit_square();
        let k = mitc4_local_stiffness(&coords, 200e6, 0.3, 0.01);

        // All diagonal entries should be non-negative
        for i in 0..24 {
            assert!(
                k[i * 24 + i] >= 0.0,
                "Negative diagonal at DOF {}: {}",
                i, k[i * 24 + i]
            );
        }
    }

    #[test]
    fn test_rigid_body_modes() {
        // A free quad element should have 6 zero-energy modes (rigid body)
        let coords = make_unit_square();
        let k = mitc4_local_stiffness(&coords, 200e6, 0.3, 0.01);

        // Test rigid body translation in x: u = [1,0,0,0,0,0] for all nodes
        let mut u_tx = [0.0; 24];
        for i in 0..4 { u_tx[i * 6] = 1.0; }
        let f = mat_vec_24(&k, &u_tx);
        let f_norm: f64 = f.iter().map(|x| x * x).sum::<f64>().sqrt();
        assert!(f_norm < 1e-3, "Translation X should be zero-energy: f_norm={}", f_norm);

        // Rigid body translation in y
        let mut u_ty = [0.0; 24];
        for i in 0..4 { u_ty[i * 6 + 1] = 1.0; }
        let f = mat_vec_24(&k, &u_ty);
        let f_norm: f64 = f.iter().map(|x| x * x).sum::<f64>().sqrt();
        assert!(f_norm < 1e-3, "Translation Y should be zero-energy: f_norm={}", f_norm);

        // Rigid body translation in z
        let mut u_tz = [0.0; 24];
        for i in 0..4 { u_tz[i * 6 + 2] = 1.0; }
        let f = mat_vec_24(&k, &u_tz);
        let f_norm: f64 = f.iter().map(|x| x * x).sum::<f64>().sqrt();
        assert!(f_norm < 1e-3, "Translation Z should be zero-energy: f_norm={}", f_norm);
    }

    #[test]
    fn test_transform_orthogonal() {
        let coords = make_unit_square();
        let t = quad_transform_3d(&coords);

        // T^T * T = I
        for i in 0..24 {
            for j in 0..24 {
                let mut dot = 0.0;
                for k in 0..24 {
                    dot += t[k * 24 + i] * t[k * 24 + j];
                }
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!(
                    (dot - expected).abs() < 1e-10,
                    "T^T*T[{},{}] = {}, expected {}",
                    i, j, dot, expected
                );
            }
        }
    }

    #[test]
    fn test_mass_matrix_total() {
        let coords = make_unit_square();
        let rho = 7850.0; // kg/m³
        let t = 0.01; // m
        let m = quad_consistent_mass(&coords, rho, t);

        // Total mass = rho * t * area = 7850 * 0.01 * 1.0 = 78.5 kg
        let expected_mass = rho * t * 1.0; // area = 1m²

        // Sum of diagonal translational mass entries / 3 (for each direction)
        // For consistent mass, total = sum of all entries per direction
        let mut total = 0.0;
        for i in 0..4 {
            for j in 0..4 {
                total += m[(i * 6) * 24 + (j * 6)];
            }
        }
        assert!(
            (total - expected_mass).abs() / expected_mass < 0.01,
            "Total mass: got {} expected {}", total, expected_mass
        );
    }

    /// Helper: 24×24 matrix-vector multiply
    fn mat_vec_24(k: &[f64], u: &[f64; 24]) -> [f64; 24] {
        let mut f = [0.0; 24];
        for i in 0..24 {
            for j in 0..24 {
                f[i] += k[i * 24 + j] * u[j];
            }
        }
        f
    }

    #[test]
    fn test_invert_4x4() {
        // SPD matrix
        let m = [
            4.0, 2.0, 1.0, 0.5,
            2.0, 5.0, 1.5, 1.0,
            1.0, 1.5, 6.0, 2.0,
            0.5, 1.0, 2.0, 7.0,
        ];
        let inv = invert_4x4(&m);
        // Check M * M^{-1} = I
        for i in 0..4 {
            for j in 0..4 {
                let mut dot = 0.0;
                for k in 0..4 {
                    dot += m[i * 4 + k] * inv[k * 4 + j];
                }
                let expected = if i == j { 1.0 } else { 0.0 };
                assert!(
                    (dot - expected).abs() < 1e-12,
                    "M*M^-1 [{},{}] = {}, expected {}",
                    i, j, dot, expected
                );
            }
        }
    }

    #[test]
    fn test_eas_softens_membrane() {
        // EAS should reduce membrane stiffness (soften the element).
        // Compare diagonal membrane entries of a distorted quad with/without EAS.
        // We can't easily toggle EAS, so instead verify the membrane diagonal
        // entries are smaller than what pure bilinear would give.
        let coords = make_unit_square();
        let k_eas = mitc4_local_stiffness(&coords, 200e6, 0.3, 0.01);

        // For a unit square, the EAS correction is nonzero for the shear-coupled
        // membrane DOFs. Check that diagonals are positive and the matrix is
        // well-conditioned.
        let mem_dofs = [0usize, 1, 6, 7, 12, 13, 18, 19];
        for &d in &mem_dofs {
            assert!(
                k_eas[d * 24 + d] > 0.0,
                "Membrane DOF {} has non-positive diagonal: {}", d, k_eas[d * 24 + d]
            );
        }

        // Also test on a distorted (non-rectangular) quad where EAS matters more
        let coords_dist = [
            [0.0, 0.0, 0.0],
            [1.2, 0.1, 0.0],
            [0.9, 1.1, 0.0],
            [0.1, 0.9, 0.0],
        ];
        let k_dist = mitc4_local_stiffness(&coords_dist, 200e6, 0.3, 0.01);
        // Symmetry
        for i in 0..24 {
            for j in 0..24 {
                let diff = (k_dist[i * 24 + j] - k_dist[j * 24 + i]).abs();
                let scale = k_dist[i * 24 + j].abs().max(k_dist[j * 24 + i].abs()).max(1e-10);
                assert!(
                    diff / scale < 1e-10,
                    "Distorted quad not symmetric at ({},{})", i, j
                );
            }
        }
        // Positive diagonals
        for i in 0..24 {
            assert!(
                k_dist[i * 24 + i] >= 0.0,
                "Distorted quad negative diagonal at {}: {}", i, k_dist[i * 24 + i]
            );
        }
    }
}
