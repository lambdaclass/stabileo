/// Degenerated continuum shell element with MITC4 shear tying.
///
/// 4-node shell with 24 DOFs (6 per node: ux, uy, uz, rx, ry, rz).
/// Unlike the flat MITC4 (quad.rs) which projects geometry to a single flat plane,
/// this element computes covariant basis vectors from the actual 3D nodal geometry
/// at each Gauss point, capturing curvature without flat projection.
///
/// Key features:
/// - Degenerated continuum formulation (Ahmad et al. 1970)
/// - Per-node director vectors (shell normals) from element geometry
/// - 3D covariant basis computed at each Gauss point
/// - MITC4 ANS transverse shear tying (Bathe & Dvorkin 1986) in covariant frame
/// - Hughes-Brezzi drilling DOF stabilization
/// - 2×2 Gauss (in-plane) × 2-point (through-thickness) = 8 quadrature points
/// - Stiffness assembled directly in global coordinates (no transform needed)
///
/// References:
///   - Ahmad, Irons & Zienkiewicz (1970): "Analysis of thick and thin shell structures"
///   - Bathe & Dvorkin (1986): "A formulation of general shell elements"
///   - Hughes & Brezzi (1989): Drilling rotations formulation
///   - Cook et al.: "Concepts and Applications of FEA", Ch. 13

use crate::element::quad::QuadStressResult;

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

fn normalize3(v: &[f64; 3]) -> [f64; 3] {
    let l = norm3(v);
    if l > 1e-15 { [v[0] / l, v[1] / l, v[2] / l] } else { [0.0, 0.0, 1.0] }
}

// ==================== Shape Functions ====================

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

/// 2-point Gauss quadrature through thickness.
fn gauss_thickness() -> [(f64, f64); 2] {
    let g = 1.0 / 3.0_f64.sqrt();
    [(-g, 1.0), (g, 1.0)]
}

// ==================== Director Computation ====================

/// Compute per-node director vectors (unit normals) from element geometry.
/// For each node, takes the cross product of the two edges meeting at that corner.
/// For shared nodes, callers should average directors from adjacent elements.
pub fn compute_element_directors(coords: &[[f64; 3]; 4]) -> [[f64; 3]; 4] {
    // Compute normal at each corner using adjacent edge vectors
    let mut dirs = [[0.0; 3]; 4];

    // Node 0 (-1,-1): edges 0→1 and 0→3
    let e01 = sub3(&coords[1], &coords[0]);
    let e03 = sub3(&coords[3], &coords[0]);
    dirs[0] = normalize3(&cross3(&e01, &e03));

    // Node 1 (1,-1): edges 1→2 and 1→0
    let e12 = sub3(&coords[2], &coords[1]);
    let e10 = sub3(&coords[0], &coords[1]);
    dirs[1] = normalize3(&cross3(&e12, &e10));

    // Node 2 (1,1): edges 2→3 and 2→1
    let e23 = sub3(&coords[3], &coords[2]);
    let e21 = sub3(&coords[1], &coords[2]);
    dirs[2] = normalize3(&cross3(&e23, &e21));

    // Node 3 (-1,1): edges 3→0 and 3→2
    let e30 = sub3(&coords[0], &coords[3]);
    let e32 = sub3(&coords[2], &coords[3]);
    dirs[3] = normalize3(&cross3(&e30, &e32));

    // Ensure all directors point in the same hemisphere as the element average normal
    let d13 = sub3(&coords[2], &coords[0]);
    let d24 = sub3(&coords[3], &coords[1]);
    let avg_normal = normalize3(&cross3(&d13, &d24));

    for d in &mut dirs {
        if dot3(d, &avg_normal) < 0.0 {
            d[0] = -d[0]; d[1] = -d[1]; d[2] = -d[2];
        }
    }

    dirs
}

// ==================== Covariant Basis ====================

/// Compute covariant basis vectors g1, g2, g3 at (xi, eta, zeta).
///
/// Geometry: x(ξ,η,ζ) = Σ N_i · x_i + ζ·(h/2)·Σ N_i · d_i
///
/// g1 = ∂x/∂ξ = Σ(∂N/∂ξ)·x_i + ζ·(h/2)·Σ(∂N/∂ξ)·d_i
/// g2 = ∂x/∂η = Σ(∂N/∂η)·x_i + ζ·(h/2)·Σ(∂N/∂η)·d_i
/// g3 = ∂x/∂ζ = (h/2)·Σ N_i·d_i
///
/// Returns (g1, g2, g3, det_J) where det_J = g1 · (g2 × g3).
fn covariant_basis(
    coords: &[[f64; 3]; 4],
    dirs: &[[f64; 3]; 4],
    h: f64,
    xi: f64, eta: f64, zeta: f64,
) -> ([f64; 3], [f64; 3], [f64; 3], f64) {
    let n = shape_functions(xi, eta);
    let (dn_dxi, dn_deta) = shape_derivatives(xi, eta);
    let half_h = 0.5 * h;

    let mut g1 = [0.0; 3];
    let mut g2 = [0.0; 3];
    let mut g3 = [0.0; 3];

    for i in 0..4 {
        for k in 0..3 {
            g1[k] += dn_dxi[i] * coords[i][k] + zeta * half_h * dn_dxi[i] * dirs[i][k];
            g2[k] += dn_deta[i] * coords[i][k] + zeta * half_h * dn_deta[i] * dirs[i][k];
            g3[k] += half_h * n[i] * dirs[i][k];
        }
    }

    let g2xg3 = cross3(&g2, &g3);
    let det_j = dot3(&g1, &g2xg3);

    (g1, g2, g3, det_j)
}

/// Build local orthonormal frame from covariant basis vectors.
/// e3 = g3/|g3|, e1 = normalize(g1 - (g1·e3)·e3), e2 = e3 × e1
fn local_frame(g1: &[f64; 3], _g2: &[f64; 3], g3: &[f64; 3]) -> ([f64; 3], [f64; 3], [f64; 3]) {
    let e3 = normalize3(g3);

    // Project g1 onto plane perpendicular to e3
    let g1_dot_e3 = dot3(g1, &e3);
    let g1_perp = [
        g1[0] - g1_dot_e3 * e3[0],
        g1[1] - g1_dot_e3 * e3[1],
        g1[2] - g1_dot_e3 * e3[2],
    ];
    let e1 = normalize3(&g1_perp);
    let e2 = cross3(&e3, &e1);

    (e1, e2, e3)
}

// ==================== B-Matrix ====================

/// Compute rotation vector components for node i at (xi, eta, zeta).
///
/// For the degenerated shell, the rotation θ produces displacement:
///   u_rot = ζ·(h/2) · (θ × d_i) · N_i
///
/// We need two vectors perpendicular to d_i for the rotation parameterization:
///   v1_i, v2_i such that θ × d_i maps (θ_1, θ_2) → displacement increment.
///
/// Using global rotations (rx, ry, rz), the cross product θ × d gives:
///   θ × d = [θ_y·d_z - θ_z·d_y, θ_z·d_x - θ_x·d_z, θ_x·d_y - θ_y·d_x]
fn build_b_matrix_at_point(
    _coords: &[[f64; 3]; 4],
    dirs: &[[f64; 3]; 4],
    h: f64,
    xi: f64, eta: f64, zeta: f64,
    e1: &[f64; 3], e2: &[f64; 3], _e3: &[f64; 3],
    inv_j: &[[f64; 3]; 3],
) -> [[f64; 24]; 5] {
    let n = shape_functions(xi, eta);
    let (dn_dxi, dn_deta) = shape_derivatives(xi, eta);
    let half_h = 0.5 * h;

    // B-matrix: 5 strains × 24 DOFs
    // Strains: [ε11, ε22, 2ε12, 2ε13, 2ε23] in local (e1, e2, e3) frame
    let mut b = [[0.0f64; 24]; 5];

    for i in 0..4 {
        let di = i * 6; // DOF offset for node i
        let d = &dirs[i];

        // Derivatives of position w.r.t. xi, eta (mid-surface + thickness terms)
        // dx/dξ_i = dn_dxi[i] * x_i + zeta * half_h * dn_dxi[i] * d_i (for translations)
        // dx/dη_i = dn_deta[i] * x_i + zeta * half_h * dn_deta[i] * d_i (for translations)
        // dx/dζ_i = half_h * n[i] * d_i (for translations — zero, handled via directors)

        // For translation DOFs (ux, uy, uz):
        // ∂u/∂ξ = dn_dxi[i] * [ux, uy, uz]
        // ∂u/∂η = dn_deta[i] * [ux, uy, uz]
        // ∂u/∂ζ = 0 (translations have no ζ dependence)

        // Physical derivatives: ∂u/∂x_k = Σ_j inv_j[k][j] * ∂u/∂ξ_j
        // ∂/∂x1 = inv_j[0][0]*∂/∂ξ + inv_j[0][1]*∂/∂η + inv_j[0][2]*∂/∂ζ
        // ∂/∂x2 = inv_j[1][0]*∂/∂ξ + inv_j[1][1]*∂/∂η + inv_j[1][2]*∂/∂ζ
        // ∂/∂x3 = inv_j[2][0]*∂/∂ξ + inv_j[2][1]*∂/∂η + inv_j[2][2]*∂/∂ζ

        // But we need strains in the local frame (e1, e2, e3).
        // ε_αβ = 0.5*(∂u_α/∂x_β + ∂u_β/∂x_α)
        // where u_α = u · e_α and x_β is along e_β direction.

        // For translations: contribution to ∂u_global/∂ξ and ∂u_global/∂η
        // Then project onto local frame.

        // Translation contributions:
        // ∂(u_global)/∂ξ += dn_dxi[i] * delta_col  (delta_col for ux, uy, uz)
        // ∂(u_global)/∂η += dn_deta[i] * delta_col
        // ∂(u_global)/∂ζ += 0

        // For rotations: the displacement due to rotation is:
        //   u_rot = ζ * half_h * N_i * (θ × d_i)
        // So: ∂(u_rot)/∂ξ = ζ * half_h * dn_dxi[i] * (θ × d_i)
        //     ∂(u_rot)/∂η = ζ * half_h * dn_deta[i] * (θ × d_i)
        //     ∂(u_rot)/∂ζ = half_h * N_i * (θ × d_i)

        // Degenerated shell rotation: u_rot = ζ·(h/2)·N_i·(d_i × θ_i)
        // d × θ for θ_x=1: [0, d_z, -d_y]
        // d × θ for θ_y=1: [-d_z, 0, d_x]
        // d × θ for θ_z=1: [d_y, -d_x, 0]
        // Note: sign convention doesn't affect K = B^T D B (quadratic form).

        let cross_rx = [0.0, d[2], -d[1]];     // d × e_x  (θ_x=1)
        let cross_ry = [-d[2], 0.0, d[0]];     // d × e_y  (θ_y=1)
        let cross_rz = [d[1], -d[0], 0.0];     // d × e_z  (θ_z=1)

        // For each global DOF component (ux, uy, uz, rx, ry, rz):
        // Compute ∂u_global/∂ξ, ∂u_global/∂η, ∂u_global/∂ζ
        // Then compute local strain contributions

        for dof_local in 0..6 {
            let col = di + dof_local;

            // ∂u_global/∂ξ, ∂u_global/∂η, ∂u_global/∂ζ for this DOF
            let mut du_dxi = [0.0; 3];
            let mut du_deta = [0.0; 3];
            let mut du_dzeta = [0.0; 3];

            match dof_local {
                0 => { // ux: u_global = [1,0,0] * N_i → du/dξ = [dn_dxi, 0, 0]
                    du_dxi[0] = dn_dxi[i];
                    du_deta[0] = dn_deta[i];
                },
                1 => { // uy
                    du_dxi[1] = dn_dxi[i];
                    du_deta[1] = dn_deta[i];
                },
                2 => { // uz
                    du_dxi[2] = dn_dxi[i];
                    du_deta[2] = dn_deta[i];
                },
                3 => { // rx: u_rot = ζ * half_h * N_i * cross_rx
                    for k in 0..3 {
                        du_dxi[k] = zeta * half_h * dn_dxi[i] * cross_rx[k];
                        du_deta[k] = zeta * half_h * dn_deta[i] * cross_rx[k];
                        du_dzeta[k] = half_h * n[i] * cross_rx[k];
                    }
                },
                4 => { // ry
                    for k in 0..3 {
                        du_dxi[k] = zeta * half_h * dn_dxi[i] * cross_ry[k];
                        du_deta[k] = zeta * half_h * dn_deta[i] * cross_ry[k];
                        du_dzeta[k] = half_h * n[i] * cross_ry[k];
                    }
                },
                5 => { // rz (drilling — handled separately via penalty)
                    for k in 0..3 {
                        du_dxi[k] = zeta * half_h * dn_dxi[i] * cross_rz[k];
                        du_deta[k] = zeta * half_h * dn_deta[i] * cross_rz[k];
                        du_dzeta[k] = half_h * n[i] * cross_rz[k];
                    }
                },
                _ => {}
            }

            // Physical derivatives: ∂u_global/∂x_phys = J^{-1} * [∂u/∂ξ, ∂u/∂η, ∂u/∂ζ]
            let mut du_dx = [[0.0; 3]; 3]; // du_dx[phys_dir][global_comp]
            for p in 0..3 { // physical direction (along g1, g2, g3)
                for gc in 0..3 { // global component (x, y, z)
                    du_dx[p][gc] = inv_j[p][0] * du_dxi[gc]
                                 + inv_j[p][1] * du_deta[gc]
                                 + inv_j[p][2] * du_dzeta[gc];
                }
            }

            // Project to local frame to get local velocity gradient:
            // ∂u_α/∂x_β = Σ_p Σ_q e_α[q] * du_dx[p][q] * e_β · g_hat_p
            // But since we used inv_j which already maps to physical directions
            // aligned with covariant directions, we need a different approach.

            // Actually, du_dx[p] gives ∂u/∂(covariant direction p), not ∂u/∂(local direction p).
            // We need to be more careful.

            // The covariant basis vectors are g1, g2, g3.
            // inv_j maps from natural (ξ,η,ζ) to "contravariant" frame.
            // du_dx[p][gc] = ∂u_{gc}/∂x^p where x^p are contravariant coordinates.

            // For the strain in local frame:
            // ε_αβ = 0.5 * (e_α · (∂u/∂x^p) * g^p · e_β + e_β · (∂u/∂x^p) * g^p · e_α)
            // This is already what we have since inv_j maps derivatives to the
            // physical/Cartesian frame (because g1, g2, g3 are in global Cartesian coords).

            // So du_dx[p][gc] = ∂u_{gc}/∂x_p  (Cartesian derivative)
            // Wait — inv_j[p][j] gives the mapping from natural to physical:
            //   ∂f/∂x_p = Σ_j J^{-1}_{pj} ∂f/∂ξ_j
            // This is correct when x_p is the p-th Cartesian direction? No.
            // J maps natural → physical: ∂x/∂ξ = J, so J^{-1} maps physical → natural.
            // But ∂f/∂x = J^{-T} ∂f/∂ξ  (chain rule for scalar f).
            // For vector u, ∂u_k/∂x_p = Σ_j (J^{-1})_{jp} ∂u_k/∂ξ_j
            // Hmm, this gets confusing. Let me be precise.

            // The Jacobian J[i][j] = ∂x_i/∂ξ_j where x are global Cartesian.
            // Actually for the 3D degenerated shell, J is 3×3:
            // J[i][j] = g_j[i] (j-th covariant vector, i-th component)
            // i.e. column j of J = g_j in Cartesian.

            // For a scalar f: ∂f/∂x = J^{-T} ∂f/∂ξ
            // For a vector component u_k: ∂u_k/∂x_i = Σ_j (J^{-T})_{ij} ∂u_k/∂ξ_j
            //                                        = Σ_j (J^{-1})_{ji} ∂u_k/∂ξ_j

            // So: ∂u_k/∂x_i = Σ_j inv_j[j][i] * ∂u_k/∂ξ_j
            // Let me recompute properly:

            let mut grad_u = [[0.0; 3]; 3]; // grad_u[k][i] = ∂u_k/∂x_i (Cartesian)
            for k in 0..3 {
                for ii in 0..3 {
                    grad_u[k][ii] = inv_j[0][ii] * du_dxi[k]
                                  + inv_j[1][ii] * du_deta[k]
                                  + inv_j[2][ii] * du_dzeta[k];
                }
            }

            // Local strain components from Cartesian gradient:
            // ε_local[α][β] = 0.5*(Σ_k e_α[k]·∂u_k/∂x_i·e_β[i] + Σ_k e_β[k]·∂u_k/∂x_i·e_α[i])
            // Simplified: let ε_αβ = 0.5*(L_αβ + L_βα) where L_αβ = Σ_{k,i} e_α[k]*grad_u[k][i]*e_β[i]

            // L_αβ = (e_α)^T · grad_u · e_β
            let e = [e1, e2, _e3]; // local frame vectors

            // ε11 = L_11 (symmetric by itself for single DOF)
            let l_11: f64 = (0..3).map(|k| (0..3).map(|ii| e[0][k] * grad_u[k][ii] * e[0][ii]).sum::<f64>()).sum();
            b[0][col] = l_11;

            // ε22
            let l_22: f64 = (0..3).map(|k| (0..3).map(|ii| e[1][k] * grad_u[k][ii] * e[1][ii]).sum::<f64>()).sum();
            b[1][col] = l_22;

            // 2*ε12 = L_12 + L_21
            let l_12: f64 = (0..3).map(|k| (0..3).map(|ii| e[0][k] * grad_u[k][ii] * e[1][ii]).sum::<f64>()).sum();
            let l_21: f64 = (0..3).map(|k| (0..3).map(|ii| e[1][k] * grad_u[k][ii] * e[0][ii]).sum::<f64>()).sum();
            b[2][col] = l_12 + l_21;

            // 2*ε13 = L_13 + L_31 (transverse shear — will be replaced by ANS)
            let l_13: f64 = (0..3).map(|k| (0..3).map(|ii| e[0][k] * grad_u[k][ii] * e[2][ii]).sum::<f64>()).sum();
            let l_31: f64 = (0..3).map(|k| (0..3).map(|ii| e[2][k] * grad_u[k][ii] * e[0][ii]).sum::<f64>()).sum();
            b[3][col] = l_13 + l_31;

            // 2*ε23 = L_23 + L_32 (transverse shear — will be replaced by ANS)
            let l_23: f64 = (0..3).map(|k| (0..3).map(|ii| e[1][k] * grad_u[k][ii] * e[2][ii]).sum::<f64>()).sum();
            let l_32: f64 = (0..3).map(|k| (0..3).map(|ii| e[2][k] * grad_u[k][ii] * e[1][ii]).sum::<f64>()).sum();
            b[4][col] = l_23 + l_32;
        }
    }

    b
}

/// Build B-matrix using DIRECT COVARIANT strain computation (alternative to Cartesian gradient).
///
/// Instead of computing the full Cartesian gradient via J^{-1} and projecting onto the local
/// frame, this approach:
///   1. Computes covariant strain components directly from du/dξ · g_i
///   2. Converts to physical strains by dividing by metric factors |g_i|·|g_j|
///   3. Transforms from the (g1_hat, g2_hat) frame to the (e1, e2) local frame
///
/// For flat elements or nearly Cartesian geometry, this should give identical results
/// to build_b_matrix_at_point. For doubly-curved surfaces, any difference reveals
/// sensitivity to the Jacobian-inverse vs covariant approach.
///
/// Returns the same 5×24 B-matrix: [ε11, ε22, 2ε12, 2ε13, 2ε23] in local (e1, e2, e3) frame.
fn build_b_matrix_covariant(
    _coords: &[[f64; 3]; 4],
    dirs: &[[f64; 3]; 4],
    h: f64,
    xi: f64, eta: f64, zeta: f64,
    g1: &[f64; 3], g2: &[f64; 3], g3: &[f64; 3],
    e1: &[f64; 3], e2: &[f64; 3], _e3: &[f64; 3],
) -> [[f64; 24]; 5] {
    let n = shape_functions(xi, eta);
    let (dn_dxi, dn_deta) = shape_derivatives(xi, eta);
    let half_h = 0.5 * h;

    // Metric factors
    let g1_sq = dot3(g1, g1);
    let g2_sq = dot3(g2, g2);
    let g1_norm = g1_sq.sqrt();
    let g2_norm = g2_sq.sqrt();
    let g3_norm = norm3(g3);

    // Unit covariant vectors
    let g1_hat = normalize3(g1);
    let g2_hat = normalize3(g2);

    // Direction cosines: transform from (g1_hat, g2_hat) physical frame to (e1, e2) local frame
    let c11 = dot3(&g1_hat, e1);
    let c12 = dot3(&g2_hat, e1);
    let c21 = dot3(&g1_hat, e2);
    let c22 = dot3(&g2_hat, e2);

    let mut b = [[0.0f64; 24]; 5];

    for i in 0..4 {
        let di = i * 6;
        let d = &dirs[i];

        // d × θ convention (matches build_b_matrix_at_point)
        let cross_rx = [0.0, d[2], -d[1]];
        let cross_ry = [-d[2], 0.0, d[0]];
        let cross_rz = [d[1], -d[0], 0.0];

        for dof_local in 0..6 {
            let col = di + dof_local;

            // Compute parametric derivatives ∂u/∂ξ, ∂u/∂η, ∂u/∂ζ for this DOF
            let mut du_dxi = [0.0; 3];
            let mut du_deta = [0.0; 3];
            let mut du_dzeta = [0.0; 3];

            match dof_local {
                0 => {
                    du_dxi[0] = dn_dxi[i];
                    du_deta[0] = dn_deta[i];
                },
                1 => {
                    du_dxi[1] = dn_dxi[i];
                    du_deta[1] = dn_deta[i];
                },
                2 => {
                    du_dxi[2] = dn_dxi[i];
                    du_deta[2] = dn_deta[i];
                },
                3 => {
                    for k in 0..3 {
                        du_dxi[k] = zeta * half_h * dn_dxi[i] * cross_rx[k];
                        du_deta[k] = zeta * half_h * dn_deta[i] * cross_rx[k];
                        du_dzeta[k] = half_h * n[i] * cross_rx[k];
                    }
                },
                4 => {
                    for k in 0..3 {
                        du_dxi[k] = zeta * half_h * dn_dxi[i] * cross_ry[k];
                        du_deta[k] = zeta * half_h * dn_deta[i] * cross_ry[k];
                        du_dzeta[k] = half_h * n[i] * cross_ry[k];
                    }
                },
                5 => {
                    for k in 0..3 {
                        du_dxi[k] = zeta * half_h * dn_dxi[i] * cross_rz[k];
                        du_deta[k] = zeta * half_h * dn_deta[i] * cross_rz[k];
                        du_dzeta[k] = half_h * n[i] * cross_rz[k];
                    }
                },
                _ => {}
            }

            // ---- Covariant membrane strains ----
            // ε₁₁^cov = ∂u/∂ξ · g₁
            // ε₂₂^cov = ∂u/∂η · g₂
            // ε₁₂^cov = 0.5*(∂u/∂ξ · g₂ + ∂u/∂η · g₁)
            let eps_11_cov = dot3(&du_dxi, g1);
            let eps_22_cov = dot3(&du_deta, g2);
            let eps_12_cov = 0.5 * (dot3(&du_dxi, g2) + dot3(&du_deta, g1));

            // Physical strains (divide by metric)
            let eps_11_phys = if g1_sq > 1e-30 { eps_11_cov / g1_sq } else { 0.0 };
            let eps_22_phys = if g2_sq > 1e-30 { eps_22_cov / g2_sq } else { 0.0 };
            let eps_12_phys = if g1_norm > 1e-15 && g2_norm > 1e-15 {
                eps_12_cov / (g1_norm * g2_norm)
            } else {
                0.0
            };

            // Transform from (g1_hat, g2_hat) to (e1, e2) local frame
            // Tensor rotation for membrane strains:
            let eps_11_local = c11 * c11 * eps_11_phys + c12 * c12 * eps_22_phys
                + 2.0 * c11 * c12 * eps_12_phys;
            let eps_22_local = c21 * c21 * eps_11_phys + c22 * c22 * eps_22_phys
                + 2.0 * c21 * c22 * eps_12_phys;
            let two_eps_12_local = 2.0 * (c11 * c21 * eps_11_phys + c12 * c22 * eps_22_phys
                + (c11 * c22 + c12 * c21) * eps_12_phys);

            b[0][col] = eps_11_local;
            b[1][col] = eps_22_local;
            b[2][col] = two_eps_12_local;

            // ---- Covariant transverse shear strains ----
            // 2ε₁₃^cov = ∂u/∂ξ · g₃ + ∂u/∂ζ · g₁
            // 2ε₂₃^cov = ∂u/∂η · g₃ + ∂u/∂ζ · g₂
            let two_eps_13_cov = dot3(&du_dxi, g3) + dot3(&du_dzeta, g1);
            let two_eps_23_cov = dot3(&du_deta, g3) + dot3(&du_dzeta, g2);

            // Physical shear strains
            let two_eps_13_phys = if g1_norm > 1e-15 && g3_norm > 1e-15 {
                two_eps_13_cov / (g1_norm * g3_norm)
            } else {
                0.0
            };
            let two_eps_23_phys = if g2_norm > 1e-15 && g3_norm > 1e-15 {
                two_eps_23_cov / (g2_norm * g3_norm)
            } else {
                0.0
            };

            // Vector transform for shear (not tensor -- shear is a vector in the tangent plane)
            let two_eps_13_local = c11 * two_eps_13_phys + c12 * two_eps_23_phys;
            let two_eps_23_local = c21 * two_eps_13_phys + c22 * two_eps_23_phys;

            b[3][col] = two_eps_13_local;
            b[4][col] = two_eps_23_local;
        }
    }

    b
}

/// Invert a 3×3 matrix.
fn invert_3x3(m: &[[f64; 3]; 3]) -> Option<[[f64; 3]; 3]> {
    let det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
            - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
            + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

    if det.abs() < 1e-30 { return None; }

    let inv_det = 1.0 / det;
    Some([
        [
            inv_det * (m[1][1] * m[2][2] - m[1][2] * m[2][1]),
            inv_det * (m[0][2] * m[2][1] - m[0][1] * m[2][2]),
            inv_det * (m[0][1] * m[1][2] - m[0][2] * m[1][1]),
        ],
        [
            inv_det * (m[1][2] * m[2][0] - m[1][0] * m[2][2]),
            inv_det * (m[0][0] * m[2][2] - m[0][2] * m[2][0]),
            inv_det * (m[0][2] * m[1][0] - m[0][0] * m[1][2]),
        ],
        [
            inv_det * (m[1][0] * m[2][1] - m[1][1] * m[2][0]),
            inv_det * (m[0][1] * m[2][0] - m[0][0] * m[2][1]),
            inv_det * (m[0][0] * m[1][1] - m[0][1] * m[1][0]),
        ],
    ])
}

// ==================== MITC4 ANS Shear Tying ====================

/// Compute covariant transverse shear B-rows at a point.
/// Returns 2×24 B-matrix rows for (ε_ξ3, ε_η3) in covariant frame.
///
/// The MITC4 tying operates on covariant shear strains, sampling at edge midpoints
/// and interpolating bilinearly. This version works in the degenerated 3D frame.
fn shear_b_covariant(
    coords: &[[f64; 3]; 4],
    dirs: &[[f64; 3]; 4],
    h: f64,
    xi: f64, eta: f64, zeta: f64,
) -> [[f64; 24]; 2] {
    let n = shape_functions(xi, eta);
    let (dn_dxi, dn_deta) = shape_derivatives(xi, eta);
    let half_h = 0.5 * h;

    // Covariant basis at this point
    let (g1, g2, g3, _) = covariant_basis(coords, dirs, h, xi, eta, zeta);

    let mut b_cov = [[0.0; 24]; 2];

    for i in 0..4 {
        let di = i * 6;
        let d = &dirs[i];

        // d × θ convention (matches build_b_matrix_at_point)
        let cross_rx = [0.0, d[2], -d[1]];     // d × e_x  (θ_x=1)
        let cross_ry = [-d[2], 0.0, d[0]];     // d × e_y  (θ_y=1)
        let cross_rz = [d[1], -d[0], 0.0];     // d × e_z  (θ_z=1)

        for dof_local in 0..6 {
            let col = di + dof_local;

            let mut du_dxi = [0.0; 3];
            let mut du_deta = [0.0; 3];
            let mut du_dzeta = [0.0; 3];

            match dof_local {
                0 => { du_dxi[0] = dn_dxi[i]; du_deta[0] = dn_deta[i]; },
                1 => { du_dxi[1] = dn_dxi[i]; du_deta[1] = dn_deta[i]; },
                2 => { du_dxi[2] = dn_dxi[i]; du_deta[2] = dn_deta[i]; },
                3 => {
                    for k in 0..3 {
                        du_dxi[k] = zeta * half_h * dn_dxi[i] * cross_rx[k];
                        du_deta[k] = zeta * half_h * dn_deta[i] * cross_rx[k];
                        du_dzeta[k] = half_h * n[i] * cross_rx[k];
                    }
                },
                4 => {
                    for k in 0..3 {
                        du_dxi[k] = zeta * half_h * dn_dxi[i] * cross_ry[k];
                        du_deta[k] = zeta * half_h * dn_deta[i] * cross_ry[k];
                        du_dzeta[k] = half_h * n[i] * cross_ry[k];
                    }
                },
                5 => {
                    for k in 0..3 {
                        du_dxi[k] = zeta * half_h * dn_dxi[i] * cross_rz[k];
                        du_deta[k] = zeta * half_h * dn_deta[i] * cross_rz[k];
                        du_dzeta[k] = half_h * n[i] * cross_rz[k];
                    }
                },
                _ => {}
            }

            // Covariant shear components for MITC tying
            b_cov[0][col] = dot3(&du_dxi, &g3) + dot3(&du_dzeta, &g1);
            b_cov[1][col] = dot3(&du_deta, &g3) + dot3(&du_dzeta, &g2);
        }
    }

    b_cov
}

// ==================== Stiffness Matrix ====================

/// Compute 24×24 curved shell stiffness matrix directly in global coordinates.
///
/// coords: 4 node coordinates in 3D [x,y,z]
/// dirs: per-node director vectors (unit normals)
/// e: Young's modulus (kN/m²)
/// nu: Poisson's ratio
/// h: shell thickness (m)
///
/// Returns 576-element Vec (24×24 row-major).
pub fn curved_shell_stiffness(
    coords: &[[f64; 3]; 4],
    dirs: &[[f64; 3]; 4],
    e: f64,
    nu: f64,
    h: f64,
) -> Vec<f64> {
    curved_shell_stiffness_impl(coords, dirs, e, nu, h, true)
}

/// Same as `curved_shell_stiffness` but with ANS shear tying disabled (diagnostic).
pub fn curved_shell_stiffness_no_ans(
    coords: &[[f64; 3]; 4],
    dirs: &[[f64; 3]; 4],
    e: f64,
    nu: f64,
    h: f64,
) -> Vec<f64> {
    curved_shell_stiffness_impl(coords, dirs, e, nu, h, false)
}

/// Compute 24×24 curved shell stiffness using direct covariant strain computation.
///
/// This is a diagnostic variant that uses `build_b_matrix_covariant` instead of the
/// standard Cartesian-gradient `build_b_matrix_at_point`. Everything else is identical:
/// same D-matrix, same integration scheme, same ANS shear tying, same drilling penalty.
///
/// Use this to compare with the standard approach and detect Jacobian-inverse issues
/// on doubly-curved surfaces.
pub fn curved_shell_stiffness_covariant(
    coords: &[[f64; 3]; 4],
    dirs: &[[f64; 3]; 4],
    e: f64,
    nu: f64,
    h: f64,
) -> Vec<f64> {
    let ndof = 24;
    let mut k = vec![0.0; ndof * ndof];

    // 5×5 constitutive matrix (plane stress + shear) — same as standard
    let c = e / (1.0 - nu * nu);
    let d_mat = [
        [c, c * nu, 0.0, 0.0, 0.0],
        [c * nu, c, 0.0, 0.0, 0.0],
        [0.0, 0.0, c * (1.0 - nu) / 2.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, e / (2.0 * (1.0 + nu)) * 5.0 / 6.0, 0.0],
        [0.0, 0.0, 0.0, 0.0, e / (2.0 * (1.0 + nu)) * 5.0 / 6.0],
    ];

    // Drilling stiffness parameter (Hughes-Brezzi) — same as standard
    let factor_m = e * h / (1.0 - nu * nu);
    let alpha_drill = factor_m * (1.0 - nu) / 2.0 * 1e-3;

    let gauss_ip = gauss_2x2();
    let gauss_th = gauss_thickness();

    // MITC4 ANS tying points — same sampling as standard
    for &(zeta, w_z) in &gauss_th {
        let b_cov_a = shear_b_covariant(coords, dirs, h, 0.0, -1.0, zeta);
        let b_cov_b = shear_b_covariant(coords, dirs, h, 0.0, 1.0, zeta);
        let b_cov_c = shear_b_covariant(coords, dirs, h, -1.0, 0.0, zeta);
        let b_cov_d = shear_b_covariant(coords, dirs, h, 1.0, 0.0, zeta);

        for &((xi, eta), w_ip) in &gauss_ip {
            let (g1, g2, g3, det_j) = covariant_basis(coords, dirs, h, xi, eta, zeta);

            if det_j.abs() < 1e-30 { continue; }

            let (e1, e2, e3) = local_frame(&g1, &g2, &g3);

            // Build B-matrix using COVARIANT approach (the key difference)
            let mut b = build_b_matrix_covariant(
                coords, dirs, h, xi, eta, zeta,
                &g1, &g2, &g3, &e1, &e2, &e3,
            );

            // ANS shear tying: replace rows (3,4) with MITC4 tied values — same as standard
            {
                let w_a = 0.5 * (1.0 - eta);
                let w_b = 0.5 * (1.0 + eta);
                let w_c = 0.5 * (1.0 - xi);
                let w_d = 0.5 * (1.0 + xi);

                let mut b_cov_tied = [[0.0; 24]; 2];
                for col in 0..24 {
                    b_cov_tied[0][col] = w_a * b_cov_a[0][col] + w_b * b_cov_b[0][col];
                    b_cov_tied[1][col] = w_c * b_cov_c[1][col] + w_d * b_cov_d[1][col];
                }

                let g1_norm = norm3(&g1);
                let g2_norm = norm3(&g2);
                let g3_norm = norm3(&g3);
                let scale_1 = if g1_norm > 1e-15 && g3_norm > 1e-15 { 1.0 / (g1_norm * g3_norm) } else { 0.0 };
                let scale_2 = if g2_norm > 1e-15 && g3_norm > 1e-15 { 1.0 / (g2_norm * g3_norm) } else { 0.0 };

                let g1_hat = normalize3(&g1);
                let g2_hat = normalize3(&g2);
                let g1_e1 = dot3(&g1_hat, &e1);
                let g1_e2 = dot3(&g1_hat, &e2);
                let g2_e1 = dot3(&g2_hat, &e1);
                let g2_e2 = dot3(&g2_hat, &e2);

                for col in 0..24 {
                    let tied_xi = b_cov_tied[0][col] * scale_1;
                    let tied_eta = b_cov_tied[1][col] * scale_2;
                    b[3][col] = g1_e1 * tied_xi + g2_e1 * tied_eta;
                    b[4][col] = g1_e2 * tied_xi + g2_e2 * tied_eta;
                }
            }

            let dv = det_j.abs() * w_ip * w_z;

            // K += B^T · D · B · dV — same accumulation as standard
            let mut db = [[0.0; 24]; 5];
            for r in 0..5 {
                for col in 0..24 {
                    let mut val = 0.0;
                    for s in 0..5 {
                        val += d_mat[r][s] * b[s][col];
                    }
                    db[r][col] = val;
                }
            }

            for r in 0..24 {
                for cc in r..24 {
                    let mut val = 0.0;
                    for s in 0..5 {
                        val += b[s][r] * db[s][cc];
                    }
                    val *= dv;
                    k[r * ndof + cc] += val;
                    if cc != r {
                        k[cc * ndof + r] += val;
                    }
                }
            }
        }
    }

    // Drilling DOF stabilization — identical to standard
    for &((xi, eta), w_g) in &gauss_ip {
        let (g1_d, g2_d, g3_d, det_j) = covariant_basis(coords, dirs, h, xi, eta, 0.0);
        let (_, _, e3_gp) = local_frame(&g1_d, &g2_d, &g3_d);
        let n_sh = shape_functions(xi, eta);

        let dv = det_j.abs() * w_g * 2.0;

        for i in 0..4 {
            for j in 0..4 {
                let factor = dv * alpha_drill * n_sh[i] * n_sh[j];
                for a in 0..3 {
                    for bb in 0..3 {
                        let ri = i * 6 + 3 + a;
                        let rj = j * 6 + 3 + bb;
                        k[ri * ndof + rj] += factor * e3_gp[a] * e3_gp[bb];
                    }
                }
            }
        }
    }

    k
}

/// Internal implementation with optional ANS shear tying.
fn curved_shell_stiffness_impl(
    coords: &[[f64; 3]; 4],
    dirs: &[[f64; 3]; 4],
    e: f64,
    nu: f64,
    h: f64,
    use_ans: bool,
) -> Vec<f64> {
    let ndof = 24;
    let mut k = vec![0.0; ndof * ndof];

    // 5×5 constitutive matrix (plane stress + shear)
    // [σ11, σ22, σ12, σ13, σ23]^T = D * [ε11, ε22, 2ε12, 2ε13, 2ε23]^T
    let c = e / (1.0 - nu * nu);
    let d_mat = [
        [c, c * nu, 0.0, 0.0, 0.0],
        [c * nu, c, 0.0, 0.0, 0.0],
        [0.0, 0.0, c * (1.0 - nu) / 2.0, 0.0, 0.0],
        [0.0, 0.0, 0.0, e / (2.0 * (1.0 + nu)) * 5.0 / 6.0, 0.0],
        [0.0, 0.0, 0.0, 0.0, e / (2.0 * (1.0 + nu)) * 5.0 / 6.0],
    ];

    // Drilling stiffness parameter (Hughes-Brezzi)
    let factor_m = e * h / (1.0 - nu * nu);
    let alpha_drill = factor_m * (1.0 - nu) / 2.0 * 1e-3;

    let gauss_ip = gauss_2x2();
    let gauss_th = gauss_thickness();

    // MITC4 ANS tying points (evaluated at mid-surface ζ=0):
    // Sample covariant shear B-matrices at 4 edge midpoints
    // A=(0,-1), B=(0,+1): for ε_ξ3 (interpolated linearly in η)
    // C=(-1,0), D=(+1,0): for ε_η3 (interpolated linearly in ξ)
    // We evaluate at each ζ layer separately for consistency
    for &(zeta, w_z) in &gauss_th {
        let b_cov_a = shear_b_covariant(coords, dirs, h, 0.0, -1.0, zeta);
        let b_cov_b = shear_b_covariant(coords, dirs, h, 0.0, 1.0, zeta);
        let b_cov_c = shear_b_covariant(coords, dirs, h, -1.0, 0.0, zeta);
        let b_cov_d = shear_b_covariant(coords, dirs, h, 1.0, 0.0, zeta);

        for &((xi, eta), w_ip) in &gauss_ip {
            let (g1, g2, g3, det_j) = covariant_basis(coords, dirs, h, xi, eta, zeta);

            if det_j.abs() < 1e-30 { continue; }

            let (e1, e2, e3) = local_frame(&g1, &g2, &g3);

            // Build Jacobian matrix: columns are covariant vectors
            let j_mat = [
                [g1[0], g2[0], g3[0]],
                [g1[1], g2[1], g3[1]],
                [g1[2], g2[2], g3[2]],
            ];
            let inv_j = match invert_3x3(&j_mat) {
                Some(m) => m,
                None => continue,
            };

            // Build B-matrix at this point
            let mut b = build_b_matrix_at_point(coords, dirs, h, xi, eta, zeta, &e1, &e2, &e3, &inv_j);

            // ANS shear tying: replace rows (3,4) with MITC4 tied values
            if use_ans {
                let w_a = 0.5 * (1.0 - eta);
                let w_b = 0.5 * (1.0 + eta);
                let w_c = 0.5 * (1.0 - xi);
                let w_d = 0.5 * (1.0 + xi);

                let mut b_cov_tied = [[0.0; 24]; 2];
                for col in 0..24 {
                    b_cov_tied[0][col] = w_a * b_cov_a[0][col] + w_b * b_cov_b[0][col];
                    b_cov_tied[1][col] = w_c * b_cov_c[1][col] + w_d * b_cov_d[1][col];
                }

                let g1_norm = norm3(&g1);
                let g2_norm = norm3(&g2);
                let g3_norm = norm3(&g3);
                let scale_1 = if g1_norm > 1e-15 && g3_norm > 1e-15 { 1.0 / (g1_norm * g3_norm) } else { 0.0 };
                let scale_2 = if g2_norm > 1e-15 && g3_norm > 1e-15 { 1.0 / (g2_norm * g3_norm) } else { 0.0 };

                let g1_hat = normalize3(&g1);
                let g2_hat = normalize3(&g2);
                let g1_e1 = dot3(&g1_hat, &e1);
                let g1_e2 = dot3(&g1_hat, &e2);
                let g2_e1 = dot3(&g2_hat, &e1);
                let g2_e2 = dot3(&g2_hat, &e2);

                for col in 0..24 {
                    let tied_xi = b_cov_tied[0][col] * scale_1;
                    let tied_eta = b_cov_tied[1][col] * scale_2;
                    b[3][col] = g1_e1 * tied_xi + g2_e1 * tied_eta;
                    b[4][col] = g1_e2 * tied_xi + g2_e2 * tied_eta;
                }
            }
            // When use_ans=false, rows 3,4 from build_b_matrix_at_point are kept as-is

            let dv = det_j.abs() * w_ip * w_z;

            // K += B^T · D · B · dV
            // Compute D*B first (5×24)
            let mut db = [[0.0; 24]; 5];
            for r in 0..5 {
                for col in 0..24 {
                    let mut val = 0.0;
                    for s in 0..5 {
                        val += d_mat[r][s] * b[s][col];
                    }
                    db[r][col] = val;
                }
            }

            // K += B^T · (D·B) · dV
            for r in 0..24 {
                for c in r..24 {
                    let mut val = 0.0;
                    for s in 0..5 {
                        val += b[s][r] * db[s][c];
                    }
                    val *= dv;
                    k[r * ndof + c] += val;
                    if c != r {
                        k[c * ndof + r] += val;
                    }
                }
            }
        }
    }

    // Drilling DOF stabilization: penalize rotation about local normal (e3 at GP).
    // Uses the Gauss-point normal e3 to distribute the penalty across rx, ry, rz.
    // K_drill[ri+a, rj+b] += α * N_i * N_j * e3[a] * e3[b] * dA*2
    // This is PSD by construction (B_θn^T B_θn), ensuring Cholesky compatibility.
    // (factor 2.0 from ∫_{-1}^{1} dζ = 2, with det_j already containing h/2 from g₃)
    for &((xi, eta), w_g) in &gauss_ip {
        let (g1_d, g2_d, g3_d, det_j) = covariant_basis(coords, dirs, h, xi, eta, 0.0);
        let (_, _, e3_gp) = local_frame(&g1_d, &g2_d, &g3_d);
        let n_sh = shape_functions(xi, eta);

        let dv = det_j.abs() * w_g * 2.0;

        for i in 0..4 {
            for j in 0..4 {
                let factor = dv * alpha_drill * n_sh[i] * n_sh[j];
                for a in 0..3 {
                    for b in 0..3 {
                        let ri = i * 6 + 3 + a;
                        let rj = j * 6 + 3 + b;
                        k[ri * ndof + rj] += factor * e3_gp[a] * e3_gp[b];
                    }
                }
            }
        }
    }

    k
}

// ==================== Consistent Mass ====================

/// Compute 24×24 consistent mass matrix for the curved shell element.
///
/// rho: mass density (tonnes/m³ = kN·s²/m⁴ for kN unit system)
/// h: shell thickness
pub fn curved_shell_consistent_mass(
    coords: &[[f64; 3]; 4],
    dirs: &[[f64; 3]; 4],
    rho: f64,
    h: f64,
) -> Vec<f64> {
    let ndof = 24;
    let mut m = vec![0.0; ndof * ndof];

    let gauss_ip = gauss_2x2();

    for &((xi, eta), w_g) in &gauss_ip {
        let (_, _, _, det_j) = covariant_basis(coords, dirs, h, xi, eta, 0.0);
        let n_shape = shape_functions(xi, eta);
        // det_j already contains h/2 from g₃ = (h/2)·d, so ∫dζ from -1 to 1 = 2
        let dv = det_j.abs() * w_g * 2.0;

        // Translational mass: m_ij = ρ·h·∫ N_i·N_j dA · I_3
        for i in 0..4 {
            for j in i..4 {
                let mass_val = rho * dv * n_shape[i] * n_shape[j];
                for d in 0..3 {
                    let r = i * 6 + d;
                    let c = j * 6 + d;
                    m[r * ndof + c] += mass_val;
                    if i != j {
                        m[c * ndof + r] += mass_val;
                    }
                }
            }
        }

        // Rotational inertia: m_rot = ρ·h³/12·∫ N_i·N_j dA for rx, ry
        let rot_factor = rho * h * h / 12.0;
        for i in 0..4 {
            for j in i..4 {
                let mass_val = rot_factor * dv * n_shape[i] * n_shape[j];
                for d in 3..5 { // rx, ry only
                    let r = i * 6 + d;
                    let c = j * 6 + d;
                    m[r * ndof + c] += mass_val;
                    if i != j {
                        m[c * ndof + r] += mass_val;
                    }
                }
            }
        }
    }

    m
}

// ==================== Geometric Stiffness ====================

/// Compute 24×24 geometric stiffness matrix from membrane stress resultants.
///
/// nxx, nyy, nxy: membrane force resultants (force/length = stress × thickness)
pub fn curved_shell_geometric_stiffness(
    coords: &[[f64; 3]; 4],
    dirs: &[[f64; 3]; 4],
    h: f64,
    nxx: f64,
    nyy: f64,
    nxy: f64,
) -> Vec<f64> {
    let ndof = 24;
    let mut kg = vec![0.0; ndof * ndof];

    let gauss_ip = gauss_2x2();

    for &((xi, eta), w_g) in &gauss_ip {
        let (g1, g2, g3, det_j) = covariant_basis(coords, dirs, h, xi, eta, 0.0);
        let (dn_dxi, dn_deta) = shape_derivatives(xi, eta);
        let (e1, e2, _e3) = local_frame(&g1, &g2, &g3);

        // Build Jacobian and inverse for derivative mapping
        let j_mat = [
            [g1[0], g2[0], g3[0]],
            [g1[1], g2[1], g3[1]],
            [g1[2], g2[2], g3[2]],
        ];
        let inv_j = match invert_3x3(&j_mat) {
            Some(m) => m,
            None => continue,
        };

        let dv = det_j.abs() * w_g * h;

        // Compute physical derivatives of shape functions
        // ∂N_i/∂x_local1 = projection onto e1 direction
        let mut dn_d1 = [0.0; 4];
        let mut dn_d2 = [0.0; 4];
        for i in 0..4 {
            // ∂N_i/∂x_p = inv_j[0][p]*∂N_i/∂ξ + inv_j[1][p]*∂N_i/∂η
            // Then project to local: ∂N_i/∂x_local_α = Σ_p (∂N_i/∂x_p) · e_α[p]
            for p in 0..3 {
                let dn_dxp = inv_j[0][p] * dn_dxi[i] + inv_j[1][p] * dn_deta[i];
                dn_d1[i] += dn_dxp * e1[p];
                dn_d2[i] += dn_dxp * e2[p];
            }
        }

        // Geometric stiffness: K_g = ∫ [∂N/∂x1 ∂N/∂x2]^T [Nxx Nxy; Nxy Nyy] [∂N/∂x1 ∂N/∂x2] dA
        // Applied to translational DOFs only (ux, uy, uz)
        for i in 0..4 {
            for j in i..4 {
                let val = dv * (
                    nxx * dn_d1[i] * dn_d1[j]
                    + nyy * dn_d2[i] * dn_d2[j]
                    + nxy * (dn_d1[i] * dn_d2[j] + dn_d2[i] * dn_d1[j])
                );

                for d in 0..3 { // ux, uy, uz
                    let r = i * 6 + d;
                    let c = j * 6 + d;
                    kg[r * ndof + c] += val;
                    if i != j {
                        kg[c * ndof + r] += val;
                    }
                }
            }
        }
    }

    kg
}

// ==================== Stress Recovery ====================

/// Compute centroidal stresses for the curved shell element.
pub fn curved_shell_stresses(
    coords: &[[f64; 3]; 4],
    dirs: &[[f64; 3]; 4],
    u: &[f64],
    e_mod: f64,
    nu: f64,
    h: f64,
) -> QuadStressResult {
    let c = e_mod / (1.0 - nu * nu);
    let d_mat = [
        [c, c * nu, 0.0],
        [c * nu, c, 0.0],
        [0.0, 0.0, c * (1.0 - nu) / 2.0],
    ];

    let zeta = 0.0; // mid-surface
    let (g1, g2, g3, _) = covariant_basis(coords, dirs, h, 0.0, 0.0, zeta);
    let (e1, e2, e3) = local_frame(&g1, &g2, &g3);

    let j_mat = [
        [g1[0], g2[0], g3[0]],
        [g1[1], g2[1], g3[1]],
        [g1[2], g2[2], g3[2]],
    ];
    let inv_j = invert_3x3(&j_mat).unwrap_or([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]);

    let b = build_b_matrix_at_point(coords, dirs, h, 0.0, 0.0, zeta, &e1, &e2, &e3, &inv_j);

    // Compute strains
    let mut strain = [0.0; 5];
    for s in 0..5 {
        for col in 0..24 {
            strain[s] += b[s][col] * u[col];
        }
    }

    // Membrane stresses
    let sigma_xx = d_mat[0][0] * strain[0] + d_mat[0][1] * strain[1];
    let sigma_yy = d_mat[1][0] * strain[0] + d_mat[1][1] * strain[1];
    let tau_xy = d_mat[2][2] * strain[2];

    let von_mises = (sigma_xx * sigma_xx + sigma_yy * sigma_yy
        - sigma_xx * sigma_yy + 3.0 * tau_xy * tau_xy).sqrt();

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

/// Compute nodal von Mises stresses (at 4 Gauss points, extrapolated to nodes).
pub fn curved_shell_nodal_von_mises(
    coords: &[[f64; 3]; 4],
    dirs: &[[f64; 3]; 4],
    u: &[f64],
    e_mod: f64,
    nu: f64,
    h: f64,
) -> Vec<f64> {
    let c = e_mod / (1.0 - nu * nu);
    let d_mat = [
        [c, c * nu, 0.0],
        [c * nu, c, 0.0],
        [0.0, 0.0, c * (1.0 - nu) / 2.0],
    ];

    let gauss = gauss_2x2();
    let mut vm_gp = [0.0; 4];

    for (gp, &((xi, eta), _)) in gauss.iter().enumerate() {
        let (g1, g2, g3, _) = covariant_basis(coords, dirs, h, xi, eta, 0.0);
        let (e1, e2, e3) = local_frame(&g1, &g2, &g3);
        let j_mat = [
            [g1[0], g2[0], g3[0]],
            [g1[1], g2[1], g3[1]],
            [g1[2], g2[2], g3[2]],
        ];
        let inv_j = invert_3x3(&j_mat).unwrap_or([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]);
        let b = build_b_matrix_at_point(coords, dirs, h, xi, eta, 0.0, &e1, &e2, &e3, &inv_j);

        let mut strain = [0.0; 3]; // membrane only
        for s in 0..3 {
            for col in 0..24 {
                strain[s] += b[s][col] * u[col];
            }
        }

        let sxx = d_mat[0][0] * strain[0] + d_mat[0][1] * strain[1];
        let syy = d_mat[1][0] * strain[0] + d_mat[1][1] * strain[1];
        let sxy = d_mat[2][2] * strain[2];
        vm_gp[gp] = (sxx * sxx + syy * syy - sxx * syy + 3.0 * sxy * sxy).sqrt();
    }

    // Extrapolate from 2×2 Gauss points to nodes (standard bilinear extrapolation)
    let s3 = 3.0_f64.sqrt();
    let extrap = [
        [0.25 * (1.0 + s3) * (1.0 + s3), 0.25 * (1.0 - s3) * (1.0 + s3), 0.25 * (1.0 - s3) * (1.0 - s3), 0.25 * (1.0 + s3) * (1.0 - s3)],
        [0.25 * (1.0 - s3) * (1.0 + s3), 0.25 * (1.0 + s3) * (1.0 + s3), 0.25 * (1.0 + s3) * (1.0 - s3), 0.25 * (1.0 - s3) * (1.0 - s3)],
        [0.25 * (1.0 - s3) * (1.0 - s3), 0.25 * (1.0 + s3) * (1.0 - s3), 0.25 * (1.0 + s3) * (1.0 + s3), 0.25 * (1.0 - s3) * (1.0 + s3)],
        [0.25 * (1.0 + s3) * (1.0 - s3), 0.25 * (1.0 - s3) * (1.0 - s3), 0.25 * (1.0 - s3) * (1.0 + s3), 0.25 * (1.0 + s3) * (1.0 + s3)],
    ];

    let mut nodal_vm = vec![0.0; 4];
    for node in 0..4 {
        for gp in 0..4 {
            nodal_vm[node] += extrap[node][gp] * vm_gp[gp];
        }
        nodal_vm[node] = nodal_vm[node].max(0.0);
    }

    nodal_vm
}

// ==================== Load Vectors ====================

/// Compute pressure load vector (follower load normal to curved surface).
pub fn curved_shell_pressure_load(
    coords: &[[f64; 3]; 4],
    _dirs: &[[f64; 3]; 4],
    _h: f64,
    pressure: f64,
) -> Vec<f64> {
    let mut f = vec![0.0; 24];
    let gauss = gauss_2x2();

    for &((xi, eta), w_g) in &gauss {
        let n_shape = shape_functions(xi, eta);
        let (dn_dxi, dn_deta) = shape_derivatives(xi, eta);

        // Mid-surface tangent vectors
        let mut t1 = [0.0; 3];
        let mut t2 = [0.0; 3];
        for i in 0..4 {
            for k in 0..3 {
                t1[k] += dn_dxi[i] * coords[i][k];
                t2[k] += dn_deta[i] * coords[i][k];
            }
        }

        // Surface normal (not normalized — its magnitude gives dA)
        let normal = cross3(&t1, &t2);

        for i in 0..4 {
            for k in 0..3 {
                f[i * 6 + k] += pressure * w_g * n_shape[i] * normal[k];
            }
        }
    }

    f
}

/// Compute self-weight load vector.
pub fn curved_shell_self_weight_load(
    coords: &[[f64; 3]; 4],
    _dirs: &[[f64; 3]; 4],
    rho: f64,
    h: f64,
    gx: f64, gy: f64, gz: f64,
) -> Vec<f64> {
    let mut f = vec![0.0; 24];
    let gauss = gauss_2x2();

    for &((xi, eta), w_g) in &gauss {
        let n_shape = shape_functions(xi, eta);
        let (dn_dxi, dn_deta) = shape_derivatives(xi, eta);

        // Mid-surface tangent vectors
        let mut t1 = [0.0; 3];
        let mut t2 = [0.0; 3];
        for i in 0..4 {
            for k in 0..3 {
                t1[k] += dn_dxi[i] * coords[i][k];
                t2[k] += dn_deta[i] * coords[i][k];
            }
        }

        // Surface area element |t1 × t2|
        let normal = cross3(&t1, &t2);
        let da = norm3(&normal);

        let gravity = [gx, gy, gz];

        for i in 0..4 {
            let w = rho * h * da * w_g * n_shape[i];
            for k in 0..3 {
                f[i * 6 + k] += w * gravity[k];
            }
        }
    }

    f
}

/// Compute thermal load vector.
pub fn curved_shell_thermal_load(
    coords: &[[f64; 3]; 4],
    dirs: &[[f64; 3]; 4],
    e_mod: f64,
    nu: f64,
    h: f64,
    alpha: f64,
    dt_uniform: f64,
    dt_gradient: f64,
) -> Vec<f64> {
    let mut f = vec![0.0; 24];
    let c = e_mod / (1.0 - nu * nu);

    let gauss = gauss_2x2();
    let gauss_th = gauss_thickness();

    for &(zeta, w_z) in &gauss_th {
        for &((xi, eta), w_ip) in &gauss {
            let (g1, g2, g3, det_j) = covariant_basis(coords, dirs, h, xi, eta, zeta);
            if det_j.abs() < 1e-30 { continue; }

            let (e1, e2, e3) = local_frame(&g1, &g2, &g3);

            let j_mat = [
                [g1[0], g2[0], g3[0]],
                [g1[1], g2[1], g3[1]],
                [g1[2], g2[2], g3[2]],
            ];
            let inv_j = match invert_3x3(&j_mat) {
                Some(m) => m,
                None => continue,
            };

            let b = build_b_matrix_at_point(coords, dirs, h, xi, eta, zeta, &e1, &e2, &e3, &inv_j);

            // Thermal stress: σ_th = D · ε_th
            // ε_th = α*(ΔT + ζ*ΔTg) * [1, 1, 0, 0, 0]
            let thermal_strain = alpha * (dt_uniform + zeta * dt_gradient);
            let sigma_th = [
                c * (1.0 + nu) * thermal_strain, // σ11
                c * (1.0 + nu) * thermal_strain, // σ22
                0.0, 0.0, 0.0,
            ];

            let dv = det_j.abs() * w_ip * w_z;

            // f += B^T · σ_th · dV
            for col in 0..24 {
                for s in 0..5 {
                    f[col] += b[s][col] * sigma_th[s] * dv;
                }
            }
        }
    }

    f
}

/// Compute edge load vector.
/// edge: 0=nodes 0→1, 1=1→2, 2=2→3, 3=3→0
/// qn: normal pressure (force/length), positive = outward
/// qt: tangential traction (force/length)
pub fn curved_shell_edge_load(
    coords: &[[f64; 3]; 4],
    dirs: &[[f64; 3]; 4],
    _h: f64,
    edge: usize,
    qn: f64,
    qt: f64,
) -> Vec<f64> {
    let mut f = vec![0.0; 24];

    let edge_nodes: [(usize, usize); 4] = [(0, 1), (1, 2), (2, 3), (3, 0)];
    let (n1, n2) = edge_nodes[edge % 4];

    // 2-point Gauss on the edge
    let g = 1.0 / 3.0_f64.sqrt();
    let gauss_1d = [(-g, 1.0), (g, 1.0)];

    for &(s, w) in &gauss_1d {
        let t = 0.5 * (1.0 + s); // parametric [0, 1] along edge

        // Point on edge
        let mut pt = [0.0; 3];
        for k in 0..3 {
            pt[k] = (1.0 - t) * coords[n1][k] + t * coords[n2][k];
        }

        // Tangent along edge
        let tangent = sub3(&coords[n2], &coords[n1]);
        let edge_len = norm3(&tangent);
        let t_hat = normalize3(&tangent);

        // Interpolated director
        let mut dir = [0.0; 3];
        for k in 0..3 {
            dir[k] = (1.0 - t) * dirs[n1][k] + t * dirs[n2][k];
        }
        let dir_hat = normalize3(&dir);

        // Outward normal in the shell surface (tangent × director)
        let n_hat = normalize3(&cross3(&t_hat, &dir_hat));

        // Shape function values (linear along edge)
        let n_vals = [1.0 - t, t];
        let local_nodes = [n1, n2];

        let dl = 0.5 * edge_len * w;

        for (li, &node) in local_nodes.iter().enumerate() {
            for k in 0..3 {
                f[node * 6 + k] += dl * n_vals[li] * (qn * n_hat[k] + qt * t_hat[k]);
            }
        }
    }

    f
}

// ==================== Jacobian Check ====================

/// Check element quality: returns (min_det_j, max_det_j, is_valid).
pub fn curved_shell_check_jacobian(
    coords: &[[f64; 3]; 4],
    dirs: &[[f64; 3]; 4],
    h: f64,
) -> (f64, f64, bool) {
    let gauss = gauss_2x2();
    let mut min_det = f64::MAX;
    let mut max_det = f64::MIN;

    for &((xi, eta), _) in &gauss {
        let (_, _, _, det_j) = covariant_basis(coords, dirs, h, xi, eta, 0.0);
        min_det = min_det.min(det_j);
        max_det = max_det.max(det_j);
    }

    let valid = min_det > 0.0;
    (min_det, max_det, valid)
}

// ==================== Tests ====================

#[cfg(test)]
mod tests {
    use super::*;

    /// Flat square element should produce same DOF pattern as MITC4.
    #[test]
    fn shape_function_partition_of_unity() {
        let xi = 0.3;
        let eta = -0.2;
        let n = shape_functions(xi, eta);
        let sum: f64 = n.iter().sum();
        assert!((sum - 1.0).abs() < 1e-14, "Shape functions don't sum to 1: {sum}");
    }

    #[test]
    fn director_computation_flat_element() {
        let coords = [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [1.0, 1.0, 0.0],
            [0.0, 1.0, 0.0],
        ];
        let dirs = compute_element_directors(&coords);
        for d in &dirs {
            assert!((d[2] - 1.0).abs() < 1e-10, "Director not [0,0,1] for flat XY element: {:?}", d);
        }
    }

    #[test]
    fn director_computation_tilted_element() {
        // Element tilted 45° about X axis
        let s = 0.5_f64.sqrt();
        let coords = [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [1.0, s, s],
            [0.0, s, s],
        ];
        let dirs = compute_element_directors(&coords);
        // Normal should be approximately [0, -sin45, cos45] = [0, -s, s]
        for d in &dirs {
            assert!(d[0].abs() < 1e-10, "Director X should be ~0: {}", d[0]);
            assert!((d[1] + s).abs() < 0.1 || (d[1] - s).abs() < 0.1, "Director Y unexpected: {}", d[1]);
        }
    }

    #[test]
    fn stiffness_symmetry() {
        let coords = [
            [0.0, 0.0, 0.0],
            [2.0, 0.0, 0.0],
            [2.0, 1.5, 0.0],
            [0.0, 1.5, 0.0],
        ];
        let dirs = compute_element_directors(&coords);
        let k = curved_shell_stiffness(&coords, &dirs, 200000.0, 0.3, 0.01);

        for i in 0..24 {
            for j in (i + 1)..24 {
                let diff = (k[i * 24 + j] - k[j * 24 + i]).abs();
                let max_val = k[i * 24 + j].abs().max(k[j * 24 + i].abs());
                if max_val > 1e-10 {
                    let rel = diff / max_val;
                    assert!(rel < 1e-8, "K[{i},{j}] not symmetric: {} vs {} (rel err {rel})",
                        k[i * 24 + j], k[j * 24 + i]);
                }
            }
        }
    }

    #[test]
    fn stiffness_positive_diagonal() {
        let coords = [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [1.0, 1.0, 0.0],
            [0.0, 1.0, 0.0],
        ];
        let dirs = compute_element_directors(&coords);
        let k = curved_shell_stiffness(&coords, &dirs, 200000.0, 0.3, 0.01);

        for i in 0..24 {
            assert!(k[i * 24 + i] > 0.0, "K[{i},{i}] = {} should be positive", k[i * 24 + i]);
        }
    }

    #[test]
    fn rigid_body_modes() {
        // A free element should have 6 zero-energy modes (3 translations, 3 rotations)
        let coords = [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [1.0, 1.0, 0.0],
            [0.0, 1.0, 0.0],
        ];
        let dirs = compute_element_directors(&coords);
        let k = curved_shell_stiffness(&coords, &dirs, 200000.0, 0.3, 0.01);

        // Check translation in X: u = [1,0,0,0,0,0, 1,0,0,0,0,0, ...]
        let mut u_tx = vec![0.0; 24];
        for i in 0..4 { u_tx[i * 6] = 1.0; }

        let mut ku = vec![0.0; 24];
        for i in 0..24 {
            for j in 0..24 {
                ku[i] += k[i * 24 + j] * u_tx[j];
            }
        }
        let energy: f64 = ku.iter().zip(u_tx.iter()).map(|(a, b)| a * b).sum();
        assert!(energy.abs() < 1e-6, "Translation X should be zero-energy mode, got {energy}");
    }

    #[test]
    fn mass_positive_and_symmetric() {
        let coords = [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [1.0, 1.0, 0.0],
            [0.0, 1.0, 0.0],
        ];
        let dirs = compute_element_directors(&coords);
        let m = curved_shell_consistent_mass(&coords, &dirs, 7.85, 0.01);

        // Check symmetry
        for i in 0..24 {
            for j in (i + 1)..24 {
                let diff = (m[i * 24 + j] - m[j * 24 + i]).abs();
                assert!(diff < 1e-15, "M not symmetric at [{i},{j}]");
            }
        }

        // Total translational mass should be ρ·h·A = 7.85 * 0.01 * 1.0 = 0.0785
        let expected_mass = 7.85 * 0.01 * 1.0;
        let mut total_x = 0.0;
        for i in 0..4 {
            for j in 0..4 {
                total_x += m[(i * 6) * 24 + (j * 6)];
            }
        }
        let rel_err = (total_x - expected_mass).abs() / expected_mass;
        assert!(rel_err < 0.02, "Total mass X = {total_x}, expected {expected_mass} (rel err {rel_err})");
    }

    #[test]
    fn pressure_load_flat_element() {
        let coords = [
            [0.0, 0.0, 0.0],
            [2.0, 0.0, 0.0],
            [2.0, 1.0, 0.0],
            [0.0, 1.0, 0.0],
        ];
        let dirs = compute_element_directors(&coords);
        let f = curved_shell_pressure_load(&coords, &dirs, 0.01, 10.0);

        // Total force should be p * A = 10 * 2 = 20 in Z direction (normal to flat XY element)
        let mut total_fz = 0.0;
        for i in 0..4 {
            total_fz += f[i * 6 + 2]; // uz component
        }
        assert!((total_fz - 20.0).abs() < 0.1, "Total pressure force Z = {total_fz}, expected 20.0");

        // FX, FY should be zero
        let mut total_fx = 0.0;
        let mut total_fy = 0.0;
        for i in 0..4 {
            total_fx += f[i * 6];
            total_fy += f[i * 6 + 1];
        }
        assert!(total_fx.abs() < 1e-12, "Total FX should be 0: {total_fx}");
        assert!(total_fy.abs() < 1e-12, "Total FY should be 0: {total_fy}");
    }

    #[test]
    fn jacobian_check_valid_element() {
        let coords = [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [1.0, 1.0, 0.0],
            [0.0, 1.0, 0.0],
        ];
        let dirs = compute_element_directors(&coords);
        let (min_d, max_d, valid) = curved_shell_check_jacobian(&coords, &dirs, 0.01);
        assert!(valid, "Valid element flagged as invalid");
        assert!(min_d > 0.0, "min det should be positive: {min_d}");
        assert!(max_d > 0.0, "max det should be positive: {max_d}");
    }

    #[test]
    fn rigid_body_modes_curved() {
        // Test rigid body modes on a CURVED element (hemisphere patch)
        let r = 10.0;
        let pi = std::f64::consts::PI;
        let dphi = pi / 2.0 / 8.0;
        let dtheta = pi / 2.0 / 8.0;
        let coords = [
            [r, 0.0, 0.0],
            [r * dphi.cos(), 0.0, r * dphi.sin()],
            [r * dphi.cos() * dtheta.cos(), r * dphi.cos() * dtheta.sin(), r * dphi.sin()],
            [r * dtheta.cos(), r * dtheta.sin(), 0.0],
        ];
        // Exact surface normals
        let dirs = [
            [1.0, 0.0, 0.0],
            [dphi.cos(), 0.0, dphi.sin()],
            [dphi.cos() * dtheta.cos(), dphi.cos() * dtheta.sin(), dphi.sin()],
            [dtheta.cos(), dtheta.sin(), 0.0],
        ];
        let k = curved_shell_stiffness(&coords, &dirs, 68.25, 0.3, 0.04);

        // Translation in X
        let mut u_tx = vec![0.0; 24];
        for i in 0..4 { u_tx[i * 6] = 1.0; }
        let mut ku = vec![0.0; 24];
        for i in 0..24 { for j in 0..24 { ku[i] += k[i * 24 + j] * u_tx[j]; } }
        let energy_tx: f64 = ku.iter().zip(u_tx.iter()).map(|(a, b)| a * b).sum();

        // Translation in Y
        let mut u_ty = vec![0.0; 24];
        for i in 0..4 { u_ty[i * 6 + 1] = 1.0; }
        let mut ku_y = vec![0.0; 24];
        for i in 0..24 { for j in 0..24 { ku_y[i] += k[i * 24 + j] * u_ty[j]; } }
        let energy_ty: f64 = ku_y.iter().zip(u_ty.iter()).map(|(a, b)| a * b).sum();

        // Translation in Z
        let mut u_tz = vec![0.0; 24];
        for i in 0..4 { u_tz[i * 6 + 2] = 1.0; }
        let mut ku_z = vec![0.0; 24];
        for i in 0..24 { for j in 0..24 { ku_z[i] += k[i * 24 + j] * u_tz[j]; } }
        let energy_tz: f64 = ku_z.iter().zip(u_tz.iter()).map(|(a, b)| a * b).sum();

        println!("\nCurved element rigid body translation energies:");
        println!("  TX: {energy_tx:.4e}");
        println!("  TY: {energy_ty:.4e}");
        println!("  TZ: {energy_tz:.4e}");

        // Rigid rotation about X: θ = [1,0,0], u_mid from d×θ convention (θ=-ω)
        let xc = coords.iter().map(|c| c[0]).sum::<f64>() / 4.0;
        let yc = coords.iter().map(|c| c[1]).sum::<f64>() / 4.0;
        let zc = coords.iter().map(|c| c[2]).sum::<f64>() / 4.0;
        let u_rx: Vec<f64> = (0..4).flat_map(|i| {
            let y = coords[i][1] - yc;
            let z = coords[i][2] - zc;
            vec![0.0, z, -y, 1.0, 0.0, 0.0]
        }).collect();
        let mut ku_rx = vec![0.0; 24];
        for i in 0..24 { for j in 0..24 { ku_rx[i] += k[i * 24 + j] * u_rx[j]; } }
        let energy_rx: f64 = ku_rx.iter().zip(u_rx.iter()).map(|(a, b)| a * b).sum();

        let u_ry: Vec<f64> = (0..4).flat_map(|i| {
            let x = coords[i][0] - xc;
            let z = coords[i][2] - zc;
            vec![-z, 0.0, x, 0.0, 1.0, 0.0]
        }).collect();
        let mut ku_ry = vec![0.0; 24];
        for i in 0..24 { for j in 0..24 { ku_ry[i] += k[i * 24 + j] * u_ry[j]; } }
        let energy_ry: f64 = ku_ry.iter().zip(u_ry.iter()).map(|(a, b)| a * b).sum();

        let u_rz: Vec<f64> = (0..4).flat_map(|i| {
            let x = coords[i][0] - xc;
            let y = coords[i][1] - yc;
            vec![y, -x, 0.0, 0.0, 0.0, 1.0]
        }).collect();
        let mut ku_rz = vec![0.0; 24];
        for i in 0..24 { for j in 0..24 { ku_rz[i] += k[i * 24 + j] * u_rz[j]; } }
        let energy_rz: f64 = ku_rz.iter().zip(u_rz.iter()).map(|(a, b)| a * b).sum();

        println!("Curved element rigid body rotation energies:");
        println!("  RX: {energy_rx:.4e}");
        println!("  RY: {energy_ry:.4e}");
        println!("  RZ: {energy_rz:.4e}");

        // All rigid body mode energies should be near zero.
        // Slightly relaxed (2e-4) for curved elements where drilling penalty
        // introduces small spurious rotation energy on curved patches.
        let max_diag = (0..24).map(|i| k[i * 24 + i]).fold(0.0f64, f64::max);
        let tol = max_diag * 2e-4;
        assert!(energy_tx.abs() < tol, "TX energy too large: {energy_tx:.4e} (tol {tol:.4e})");
        assert!(energy_ty.abs() < tol, "TY energy too large: {energy_ty:.4e} (tol {tol:.4e})");
        assert!(energy_tz.abs() < tol, "TZ energy too large: {energy_tz:.4e} (tol {tol:.4e})");
        assert!(energy_rx.abs() < tol, "RX energy too large: {energy_rx:.4e} (tol {tol:.4e})");
        assert!(energy_ry.abs() < tol, "RY energy too large: {energy_ry:.4e} (tol {tol:.4e})");
        assert!(energy_rz.abs() < tol, "RZ energy too large: {energy_rz:.4e} (tol {tol:.4e})");
    }

    #[test]
    fn hemisphere_element_stiffness_diagnostic() {
        // A single element on a hemisphere, R=10, t=0.04
        // Near the equator: phi=0..11.25°, theta=0..11.25°
        let r = 10.0;
        let t = 0.04;
        let pi = std::f64::consts::PI;
        let dphi = pi / 2.0 / 8.0;   // 11.25°
        let dtheta = pi / 2.0 / 8.0;

        let coords = [
            // n0: phi=0, theta=0
            [r, 0.0, 0.0],
            // n1: phi=dphi, theta=0
            [r * dphi.cos(), 0.0, r * dphi.sin()],
            // n2: phi=dphi, theta=dtheta
            [r * dphi.cos() * dtheta.cos(), r * dphi.cos() * dtheta.sin(), r * dphi.sin()],
            // n3: phi=0, theta=dtheta
            [r * dtheta.cos(), r * dtheta.sin(), 0.0],
        ];

        let dirs = compute_element_directors(&coords);
        let k = curved_shell_stiffness(&coords, &dirs, 68.25, 0.3, t);

        // Print diagnostic info
        println!("\n=== Hemisphere Element Diagnostic ===");
        for i in 0..4 {
            println!("Node {i}: ({:.4}, {:.4}, {:.4}), dir=({:.4}, {:.4}, {:.4})",
                coords[i][0], coords[i][1], coords[i][2],
                dirs[i][0], dirs[i][1], dirs[i][2]);
        }

        // Check Jacobian at center
        let (g1, g2, g3, det_j) = covariant_basis(&coords, &dirs, t, 0.0, 0.0, 0.0);
        println!("g1 = ({:.6}, {:.6}, {:.6})", g1[0], g1[1], g1[2]);
        println!("g2 = ({:.6}, {:.6}, {:.6})", g2[0], g2[1], g2[2]);
        println!("g3 = ({:.6}, {:.6}, {:.6})", g3[0], g3[1], g3[2]);
        println!("det_J = {det_j:.6}");

        let (e1, e2, e3) = local_frame(&g1, &g2, &g3);
        println!("e1 = ({:.4}, {:.4}, {:.4})", e1[0], e1[1], e1[2]);
        println!("e2 = ({:.4}, {:.4}, {:.4})", e2[0], e2[1], e2[2]);
        println!("e3 = ({:.4}, {:.4}, {:.4})", e3[0], e3[1], e3[2]);

        // Stiffness diagonal
        println!("K diagonal (translation DOFs):");
        for i in 0..4 {
            println!("  Node {i}: ux={:.4e}, uy={:.4e}, uz={:.4e}",
                k[(i*6)*24 + i*6], k[(i*6+1)*24 + i*6+1], k[(i*6+2)*24 + i*6+2]);
        }
        println!("K diagonal (rotation DOFs):");
        for i in 0..4 {
            println!("  Node {i}: rx={:.4e}, ry={:.4e}, rz={:.4e}",
                k[(i*6+3)*24 + i*6+3], k[(i*6+4)*24 + i*6+4], k[(i*6+5)*24 + i*6+5]);
        }

        // Check stiffness is reasonable: compare with flat MITC4 scale
        // For a flat element with same E, nu, t, area ~3.84:
        // Membrane stiffness scale: E*t*A / (1-nu^2) ~ 68.25 * 0.04 * 3.84 / 0.91 ~ 11.5
        // The curved element should have similar scale
        let max_diag = (0..24).map(|i| k[i * 24 + i].abs()).fold(0.0f64, f64::max);
        let min_diag = (0..24).map(|i| k[i * 24 + i].abs()).fold(f64::MAX, f64::min);
        println!("Max diagonal: {max_diag:.4e}, Min diagonal: {min_diag:.4e}, ratio: {:.1}", max_diag / min_diag.max(1e-30));

        // All diagonals should be positive
        for i in 0..24 {
            assert!(k[i * 24 + i] > 0.0, "K[{i},{i}] = {:.4e} should be positive", k[i * 24 + i]);
        }
    }

    #[test]
    fn ans_vs_no_ans_hemisphere_element() {
        let r = 10.0;
        let pi = std::f64::consts::PI;
        let dphi = pi / 2.0 / 8.0;
        let dtheta = pi / 2.0 / 8.0;
        let coords = [
            [r, 0.0, 0.0],
            [r * dphi.cos(), 0.0, r * dphi.sin()],
            [r * dphi.cos() * dtheta.cos(), r * dphi.cos() * dtheta.sin(), r * dphi.sin()],
            [r * dtheta.cos(), r * dtheta.sin(), 0.0],
        ];
        let dirs = [
            [1.0, 0.0, 0.0],
            [dphi.cos(), 0.0, dphi.sin()],
            [dphi.cos() * dtheta.cos(), dphi.cos() * dtheta.sin(), dphi.sin()],
            [dtheta.cos(), dtheta.sin(), 0.0],
        ];
        let k_ans = curved_shell_stiffness_impl(&coords, &dirs, 68.25, 0.3, 0.04, true);
        let k_no_ans = curved_shell_stiffness_impl(&coords, &dirs, 68.25, 0.3, 0.04, false);

        println!("\n=== ANS vs No-ANS comparison ===");
        println!("Translation diagonal (ANS / no-ANS):");
        for i in 0..4 {
            for d in 0..3 {
                let idx = i * 6 + d;
                let label = ["ux", "uy", "uz"][d];
                println!("  Node {i} {label}: {:.4e} / {:.4e} (ratio {:.2})",
                    k_ans[idx * 24 + idx], k_no_ans[idx * 24 + idx],
                    k_ans[idx * 24 + idx] / k_no_ans[idx * 24 + idx].max(1e-30));
            }
        }
        println!("Rotation diagonal (ANS / no-ANS):");
        for i in 0..4 {
            for d in 0..3 {
                let idx = i * 6 + 3 + d;
                let label = ["rx", "ry", "rz"][d];
                println!("  Node {i} {label}: {:.4e} / {:.4e} (ratio {:.2})",
                    k_ans[idx * 24 + idx], k_no_ans[idx * 24 + idx],
                    k_ans[idx * 24 + idx] / k_no_ans[idx * 24 + idx].max(1e-30));
            }
        }

        // Compare Frobenius norms
        let norm_ans: f64 = k_ans.iter().map(|x| x * x).sum::<f64>().sqrt();
        let norm_no: f64 = k_no_ans.iter().map(|x| x * x).sum::<f64>().sqrt();
        println!("Frobenius norm: ANS={:.4e}, no-ANS={:.4e}, ratio={:.2}",
            norm_ans, norm_no, norm_ans / norm_no);
    }

    #[test]
    fn hemisphere_element_eigenvalues() {
        // Compute eigenvalues of a hemisphere element stiffness to check for spurious modes
        let r = 10.0;
        let pi = std::f64::consts::PI;
        let dphi = pi / 2.0 / 8.0;
        let dtheta = pi / 2.0 / 8.0;
        let coords = [
            [r, 0.0, 0.0],
            [r * dphi.cos(), 0.0, r * dphi.sin()],
            [r * dphi.cos() * dtheta.cos(), r * dphi.cos() * dtheta.sin(), r * dphi.sin()],
            [r * dtheta.cos(), r * dtheta.sin(), 0.0],
        ];
        let dirs = [
            [1.0, 0.0, 0.0],
            [dphi.cos(), 0.0, dphi.sin()],
            [dphi.cos() * dtheta.cos(), dphi.cos() * dtheta.sin(), dphi.sin()],
            [dtheta.cos(), dtheta.sin(), 0.0],
        ];

        // Use assembly E scale (×1000)
        let k = curved_shell_stiffness(&coords, &dirs, 68250.0, 0.3, 0.04);

        // Power iteration to find eigenvalues (rough approximation)
        // First, find eigenvalues using Jacobi method on symmetric matrix
        let n = 24;
        let mut a = vec![0.0; n * n];
        for i in 0..n {
            for j in 0..n {
                a[i * n + j] = 0.5 * (k[i * n + j] + k[j * n + i]); // symmetrize
            }
        }

        // Simple: compute diagonal values as proxy
        let mut diag: Vec<f64> = (0..n).map(|i| a[i * n + i]).collect();
        diag.sort_by(|a, b| a.partial_cmp(b).unwrap());
        println!("\nHemisphere element stiffness diagonal (sorted):");
        for (i, d) in diag.iter().enumerate() {
            println!("  [{i:2}] {d:.4e}");
        }

        // Also compute u^T K u for various test modes to find soft modes
        // Test: rotation of element about its centroid normal
        let xc: f64 = coords.iter().map(|c| c[0]).sum::<f64>() / 4.0;
        let yc: f64 = coords.iter().map(|c| c[1]).sum::<f64>() / 4.0;
        let zc: f64 = coords.iter().map(|c| c[2]).sum::<f64>() / 4.0;
        let avg_dir = [
            dirs.iter().map(|d| d[0]).sum::<f64>() / 4.0,
            dirs.iter().map(|d| d[1]).sum::<f64>() / 4.0,
            dirs.iter().map(|d| d[2]).sum::<f64>() / 4.0,
        ];
        let n_len = (avg_dir[0]*avg_dir[0] + avg_dir[1]*avg_dir[1] + avg_dir[2]*avg_dir[2]).sqrt();
        let n_hat = [avg_dir[0]/n_len, avg_dir[1]/n_len, avg_dir[2]/n_len];

        // Spinning mode: rotation about element normal through centroid
        let mut u_spin = vec![0.0; 24];
        for i in 0..4 {
            let dx = coords[i][0] - xc;
            let dy = coords[i][1] - yc;
            let dz = coords[i][2] - zc;
            // ω × r where ω = n_hat
            u_spin[i*6]   = n_hat[1]*dz - n_hat[2]*dy;
            u_spin[i*6+1] = n_hat[2]*dx - n_hat[0]*dz;
            u_spin[i*6+2] = n_hat[0]*dy - n_hat[1]*dx;
            // rotation = n_hat
            u_spin[i*6+3] = n_hat[0];
            u_spin[i*6+4] = n_hat[1];
            u_spin[i*6+5] = n_hat[2];
        }
        let u_norm: f64 = u_spin.iter().map(|x| x*x).sum::<f64>().sqrt();
        for x in u_spin.iter_mut() { *x /= u_norm; }

        let mut ku_spin = vec![0.0; 24];
        for i in 0..24 { for j in 0..24 { ku_spin[i] += k[i*24+j] * u_spin[j]; } }
        let energy_spin: f64 = ku_spin.iter().zip(u_spin.iter()).map(|(a,b)| a*b).sum();
        println!("Spin-about-normal energy: {energy_spin:.4e}");

        // Warping mode: alternating z at corners
        let mut u_warp = vec![0.0; 24];
        let signs = [1.0, -1.0, 1.0, -1.0]; // hourglass pattern
        for i in 0..4 {
            u_warp[i*6]   = signs[i] * dirs[i][0] * 0.001;
            u_warp[i*6+1] = signs[i] * dirs[i][1] * 0.001;
            u_warp[i*6+2] = signs[i] * dirs[i][2] * 0.001;
        }
        let w_norm: f64 = u_warp.iter().map(|x| x*x).sum::<f64>().sqrt();
        for x in u_warp.iter_mut() { *x /= w_norm; }
        let mut ku_w = vec![0.0; 24];
        for i in 0..24 { for j in 0..24 { ku_w[i] += k[i*24+j] * u_warp[j]; } }
        let energy_warp: f64 = ku_w.iter().zip(u_warp.iter()).map(|(a,b)| a*b).sum();
        println!("Hourglass normal energy: {energy_warp:.4e}");

        // In-plane tangential mode (shearing)
        // Find tangent vectors t1, t2 from e1, e2
        let g1 = [
            coords[1][0] - coords[0][0],
            coords[1][1] - coords[0][1],
            coords[1][2] - coords[0][2],
        ];
        let g1_len = (g1[0]*g1[0]+g1[1]*g1[1]+g1[2]*g1[2]).sqrt();
        let t1 = [g1[0]/g1_len, g1[1]/g1_len, g1[2]/g1_len];

        let mut u_tang = vec![0.0; 24];
        for i in 0..4 { for k in 0..3 { u_tang[i*6+k] = t1[k]; } }
        let tn: f64 = u_tang.iter().map(|x| x*x).sum::<f64>().sqrt();
        for x in u_tang.iter_mut() { *x /= tn; }
        let mut ku_t = vec![0.0; 24];
        for i in 0..24 { for j in 0..24 { ku_t[i] += k[i*24+j] * u_tang[j]; } }
        let energy_tang: f64 = ku_t.iter().zip(u_tang.iter()).map(|(a,b)| a*b).sum();
        println!("Uniform tangent translation energy: {energy_tang:.4e} (should be ~0, RBM)");
    }

    #[test]
    fn membrane_patch_test_hemisphere() {
        // Uniform radial expansion of a hemisphere element: tests membrane stiffness
        // Analytical: U = E/(1-ν) × (δ/R)² × t × A_elem
        let r = 10.0;
        let t = 0.04;
        let e_val = 68250.0; // Match assembly scaling (68.25 MPa × 1000)
        let nu = 0.3;
        let delta = 0.001; // small radial expansion

        let pi = std::f64::consts::PI;
        let dphi = pi / 2.0 / 8.0;
        let dtheta = pi / 2.0 / 8.0;

        let coords = [
            [r, 0.0, 0.0],
            [r * dphi.cos(), 0.0, r * dphi.sin()],
            [r * dphi.cos() * dtheta.cos(), r * dphi.cos() * dtheta.sin(), r * dphi.sin()],
            [r * dtheta.cos(), r * dtheta.sin(), 0.0],
        ];
        let dirs = [
            [1.0, 0.0, 0.0],
            [dphi.cos(), 0.0, dphi.sin()],
            [dphi.cos() * dtheta.cos(), dphi.cos() * dtheta.sin(), dphi.sin()],
            [dtheta.cos(), dtheta.sin(), 0.0],
        ];

        let k = curved_shell_stiffness(&coords, &dirs, e_val, nu, t);

        // Displacement: radial expansion δ at each node
        // u_i = δ × d_i, no rotations
        let mut u = vec![0.0; 24];
        for i in 0..4 {
            u[i * 6]     = delta * dirs[i][0];
            u[i * 6 + 1] = delta * dirs[i][1];
            u[i * 6 + 2] = delta * dirs[i][2];
        }

        // Compute strain energy: U = 0.5 × u^T K u
        let mut ku = vec![0.0; 24];
        for i in 0..24 {
            for j in 0..24 {
                ku[i] += k[i * 24 + j] * u[j];
            }
        }
        let u_energy: f64 = 0.5 * ku.iter().zip(u.iter()).map(|(a, b)| a * b).sum::<f64>();

        // Analytical element area (spherical quadrilateral)
        // For small angles: A ≈ R² × dphi × dtheta × cos(phi_mid)
        // phi ranges from 0 to dphi, so phi_mid ≈ dphi/2
        let phi_mid = dphi / 2.0;
        let a_elem = r * r * dphi * dtheta * phi_mid.cos();

        // Analytical strain energy: U = E/(1-ν) × (δ/R)² × t × A
        let u_analytical = e_val / (1.0 - nu) * (delta / r).powi(2) * t * a_elem;

        let ratio = u_energy / u_analytical;
        println!("\nMembrane patch test (hemisphere element):");
        println!("  Element area: {a_elem:.4e}");
        println!("  Strain energy (FEM):  {u_energy:.8e}");
        println!("  Strain energy (anal): {u_analytical:.8e}");
        println!("  Ratio: {ratio:.4}");

        // Also test with a FLAT element for reference
        let flat_coords = [
            [0.0, 0.0, 0.0],
            [r * dphi, 0.0, 0.0],
            [r * dphi, r * dtheta, 0.0],
            [0.0, r * dtheta, 0.0],
        ];
        let flat_dirs = [[0.0, 0.0, 1.0]; 4];
        let k_flat = curved_shell_stiffness(&flat_coords, &flat_dirs, e_val, nu, t);

        // Uniform biaxial extension: ε_xx = ε_yy = δ/R
        let mut u_flat = vec![0.0; 24];
        for i in 0..4 {
            u_flat[i * 6] = (delta / r) * flat_coords[i][0];     // ux = ε × x
            u_flat[i * 6 + 1] = (delta / r) * flat_coords[i][1]; // uy = ε × y
        }
        let mut ku_flat = vec![0.0; 24];
        for i in 0..24 {
            for j in 0..24 {
                ku_flat[i] += k_flat[i * 24 + j] * u_flat[j];
            }
        }
        let u_flat_energy: f64 = 0.5 * ku_flat.iter().zip(u_flat.iter()).map(|(a, b)| a * b).sum::<f64>();
        let a_flat = r * dphi * r * dtheta;
        let u_flat_analytical = e_val / (1.0 - nu) * (delta / r).powi(2) * t * a_flat;
        let ratio_flat = u_flat_energy / u_flat_analytical;
        println!("  Flat reference: FEM={u_flat_energy:.8e}, anal={u_flat_analytical:.8e}, ratio={ratio_flat:.4}");
    }

    #[test]
    fn compare_mitc4_vs_curved_hemisphere_element() {
        use crate::element::quad;

        let r = 10.0;
        let t = 0.04;
        let e_val = 68250.0;
        let nu = 0.3;
        let pi = std::f64::consts::PI;
        let dphi = pi / 2.0 / 8.0;
        let dtheta = pi / 2.0 / 8.0;

        let coords = [
            [r, 0.0, 0.0],
            [r * dphi.cos(), 0.0, r * dphi.sin()],
            [r * dphi.cos() * dtheta.cos(), r * dphi.cos() * dtheta.sin(), r * dphi.sin()],
            [r * dtheta.cos(), r * dtheta.sin(), 0.0],
        ];
        let dirs = [
            [1.0, 0.0, 0.0],
            [dphi.cos(), 0.0, dphi.sin()],
            [dphi.cos() * dtheta.cos(), dphi.cos() * dtheta.sin(), dphi.sin()],
            [dtheta.cos(), dtheta.sin(), 0.0],
        ];

        // MITC4 stiffness (local + transform to global)
        let k_mitc4_local = quad::mitc4_local_stiffness(&coords, e_val, nu, t);
        let t_mat = quad::quad_transform_3d(&coords);
        let k_mitc4 = crate::linalg::transform_stiffness(&k_mitc4_local, &t_mat, 24);

        // Curved shell stiffness (directly in global)
        let k_curved = curved_shell_stiffness(&coords, &dirs, e_val, nu, t);

        // Compare Frobenius norms
        let frob_mitc4: f64 = k_mitc4.iter().map(|x| x * x).sum::<f64>().sqrt();
        let frob_curved: f64 = k_curved.iter().map(|x| x * x).sum::<f64>().sqrt();
        println!("\n=== MITC4 vs Curved Shell (hemisphere element) ===");
        println!("Frobenius: MITC4={frob_mitc4:.4e}, Curved={frob_curved:.4e}, ratio={:.4}",
            frob_curved / frob_mitc4);

        // Compare diagonal sums
        let diag_mitc4: f64 = (0..24).map(|i| k_mitc4[i * 24 + i]).sum();
        let diag_curved: f64 = (0..24).map(|i| k_curved[i * 24 + i]).sum();
        println!("Diag sum: MITC4={diag_mitc4:.4e}, Curved={diag_curved:.4e}, ratio={:.4}",
            diag_curved / diag_mitc4);

        // Compare translation diagonal
        println!("Translation diagonal comparison:");
        for i in 0..4 {
            for d in 0..3 {
                let idx = i * 6 + d;
                let label = ["ux", "uy", "uz"][d];
                let m = k_mitc4[idx * 24 + idx];
                let c = k_curved[idx * 24 + idx];
                println!("  Node {i} {label}: MITC4={m:.4e}, Curved={c:.4e}, ratio={:.4}", c / m.max(1e-30));
            }
        }

        // Compare rotation diagonal
        println!("Rotation diagonal comparison:");
        for i in 0..4 {
            for d in 0..3 {
                let idx = i * 6 + 3 + d;
                let label = ["rx", "ry", "rz"][d];
                let m = k_mitc4[idx * 24 + idx];
                let c = k_curved[idx * 24 + idx];
                println!("  Node {i} {label}: MITC4={m:.4e}, Curved={c:.4e}, ratio={:.4}", c / m.max(1e-30));
            }
        }

        // Compare off-diagonal: translation-rotation coupling
        println!("Translation-rotation coupling (off-diagonal) at node 0:");
        for td in 0..3 {
            for rd in 0..3 {
                let ti = td;
                let ri = 3 + rd;
                let m = k_mitc4[ti * 24 + ri];
                let c = k_curved[ti * 24 + ri];
                let t_label = ["ux", "uy", "uz"][td];
                let r_label = ["rx", "ry", "rz"][rd];
                println!("  K[{t_label},{r_label}]: MITC4={m:.4e}, Curved={c:.4e}");
            }
        }

        // Test: apply same load, compare K*u for a uniform radial mode
        let mut u_rad = vec![0.0; 24];
        for i in 0..4 {
            u_rad[i * 6]     = dirs[i][0] * 0.001;
            u_rad[i * 6 + 1] = dirs[i][1] * 0.001;
            u_rad[i * 6 + 2] = dirs[i][2] * 0.001;
        }
        let mut ku_m = vec![0.0; 24];
        let mut ku_c = vec![0.0; 24];
        for i in 0..24 {
            for j in 0..24 {
                ku_m[i] += k_mitc4[i * 24 + j] * u_rad[j];
                ku_c[i] += k_curved[i * 24 + j] * u_rad[j];
            }
        }
        let e_m: f64 = 0.5 * ku_m.iter().zip(u_rad.iter()).map(|(a, b)| a * b).sum::<f64>();
        let e_c: f64 = 0.5 * ku_c.iter().zip(u_rad.iter()).map(|(a, b)| a * b).sum::<f64>();
        println!("Radial expansion energy: MITC4={e_m:.6e}, Curved={e_c:.6e}, ratio={:.4}",
            e_c / e_m.max(1e-30));

        // Also test a flat element for reference
        let flat_coords = [
            [0.0, 0.0, 0.0],
            [r * dphi, 0.0, 0.0],
            [r * dphi, r * dtheta, 0.0],
            [0.0, r * dtheta, 0.0],
        ];
        let flat_dirs = [[0.0, 0.0, 1.0]; 4];
        let k_flat_mitc4_loc = quad::mitc4_local_stiffness(&flat_coords, e_val, nu, t);
        let t_flat = quad::quad_transform_3d(&flat_coords);
        let k_flat_mitc4 = crate::linalg::transform_stiffness(&k_flat_mitc4_loc, &t_flat, 24);
        let k_flat_curved = curved_shell_stiffness(&flat_coords, &flat_dirs, e_val, nu, t);

        let frob_flat_m: f64 = k_flat_mitc4.iter().map(|x| x * x).sum::<f64>().sqrt();
        let frob_flat_c: f64 = k_flat_curved.iter().map(|x| x * x).sum::<f64>().sqrt();
        println!("\nFLAT element comparison:");
        println!("Frobenius: MITC4={frob_flat_m:.4e}, Curved={frob_flat_c:.4e}, ratio={:.4}",
            frob_flat_c / frob_flat_m);
    }

    /// Compare B-matrix membrane strain (Cartesian gradient approach) with direct
    /// covariant strain computation to verify mathematical correctness.
    #[test]
    fn b_matrix_covariant_vs_cartesian_hemisphere() {
        let r = 10.0;
        let h = 0.04;
        let pi = std::f64::consts::PI;
        let dphi = pi / 2.0 / 4.0;  // larger element for clearer signal
        let dtheta = pi / 2.0 / 4.0;

        let coords = [
            [r, 0.0, 0.0],
            [r * dphi.cos(), 0.0, r * dphi.sin()],
            [r * dphi.cos() * dtheta.cos(), r * dphi.cos() * dtheta.sin(), r * dphi.sin()],
            [r * dtheta.cos(), r * dtheta.sin(), 0.0],
        ];
        let dirs = [
            [1.0, 0.0, 0.0],
            [dphi.cos(), 0.0, dphi.sin()],
            [dphi.cos() * dtheta.cos(), dphi.cos() * dtheta.sin(), dphi.sin()],
            [dtheta.cos(), dtheta.sin(), 0.0],
        ];

        // Evaluate at center of element (ξ=η=0, ζ=0)
        let xi = 0.0;
        let eta = 0.0;
        let zeta = 0.0;

        let (g1, g2, g3, det_j) = covariant_basis(&coords, &dirs, h, xi, eta, zeta);
        let (e1, e2, e3) = local_frame(&g1, &g2, &g3);

        // Build Jacobian and inverse
        let j_mat = [
            [g1[0], g2[0], g3[0]],
            [g1[1], g2[1], g3[1]],
            [g1[2], g2[2], g3[2]],
        ];
        let inv_j = invert_3x3(&j_mat).unwrap();

        // Get B-matrix at this point
        let b = build_b_matrix_at_point(&coords, &dirs, h, xi, eta, zeta, &e1, &e2, &e3, &inv_j);

        let _n_shape = shape_functions(xi, eta);
        let (dn_dxi, dn_deta) = shape_derivatives(xi, eta);
        let _half_h = 0.5 * h;

        println!("\n=== Covariant vs Cartesian B-matrix comparison ===");
        println!("Element: hemisphere panel at equator, dphi=dtheta={:.4} rad", dphi);
        println!("g1 = [{:.6}, {:.6}, {:.6}], |g1| = {:.6}", g1[0], g1[1], g1[2], norm3(&g1));
        println!("g2 = [{:.6}, {:.6}, {:.6}], |g2| = {:.6}", g2[0], g2[1], g2[2], norm3(&g2));
        println!("g3 = [{:.6}, {:.6}, {:.6}], |g3| = {:.6}", g3[0], g3[1], g3[2], norm3(&g3));
        println!("e1 = [{:.6}, {:.6}, {:.6}]", e1[0], e1[1], e1[2]);
        println!("e2 = [{:.6}, {:.6}, {:.6}]", e2[0], e2[1], e2[2]);
        println!("e3 = [{:.6}, {:.6}, {:.6}]", e3[0], e3[1], e3[2]);
        println!("det_J = {:.6}", det_j);
        println!("g1·g2 = {:.6}", dot3(&g1, &g2));
        println!("g1·g3 = {:.6}", dot3(&g1, &g3));
        println!("g2·g3 = {:.6}", dot3(&g2, &g3));

        // For each translation DOF, compute membrane strain TWO ways:
        // Way 1: B-matrix (Cartesian gradient + local frame projection)
        // Way 2: Direct covariant strain = (∂u/∂ξ·g₁ + ∂u/∂ξ·g₁) / (2|g₁|²) for ε₁₁
        //         then transform to local frame

        println!("\n--- Translation DOF membrane strain comparison ---");
        for node in 0..4 {
            for dof in 0..3 {
                let col = node * 6 + dof;
                let dof_name = ["ux", "uy", "uz"][dof];

                // Way 1: from B-matrix
                let eps_11_b = b[0][col];
                let eps_22_b = b[1][col];
                let eps_12_b = b[2][col]; // 2*ε₁₂
                let eps_13_b = b[3][col]; // 2*ε₁₃
                let eps_23_b = b[4][col]; // 2*ε₂₃

                // Way 2: direct covariant computation
                // For translation DOF k at node i:
                // ∂u/∂ξ = dn_dxi[node] × δ_{k,dof}
                // ∂u/∂η = dn_deta[node] × δ_{k,dof}
                // ∂u/∂ζ = 0
                let mut du_dxi_vec = [0.0; 3];
                let mut du_deta_vec = [0.0; 3];
                du_dxi_vec[dof] = dn_dxi[node];
                du_deta_vec[dof] = dn_deta[node];

                // Covariant membrane strains (2D):
                // 2ε₁₁^cov = 2(∂u/∂ξ · g₁) = 2(du_dxi · g1)
                // 2ε₂₂^cov = 2(∂u/∂η · g₂) = 2(du_deta · g2)
                // 2ε₁₂^cov = (∂u/∂ξ · g₂ + ∂u/∂η · g₁)
                let eps_11_cov = dot3(&du_dxi_vec, &g1);       // ε₁₁^cov (not 2×)
                let eps_22_cov = dot3(&du_deta_vec, &g2);       // ε₂₂^cov
                let eps_12_cov = 0.5 * (dot3(&du_dxi_vec, &g2) + dot3(&du_deta_vec, &g1)); // ε₁₂^cov

                // Physical membrane strains (for orthogonal basis):
                let g1_sq = dot3(&g1, &g1);
                let g2_sq = dot3(&g2, &g2);
                let _g12 = dot3(&g1, &g2);
                let eps_11_phys = eps_11_cov / g1_sq;
                let eps_22_phys = eps_22_cov / g2_sq;
                let eps_12_phys = eps_12_cov / (norm3(&g1) * norm3(&g2));

                // Transform physical strain from (g1_hat, g2_hat) frame to (e1, e2) frame
                let g1_hat = normalize3(&g1);
                let g2_hat = normalize3(&g2);

                // For nearly orthogonal g1, g2: g1_hat ≈ e1, g2_hat ≈ e2
                // General: rotate by the angle between g1_hat and e1
                let c11 = dot3(&g1_hat, &e1);
                let c12 = dot3(&g2_hat, &e1);
                let c21 = dot3(&g1_hat, &e2);
                let c22 = dot3(&g2_hat, &e2);

                // Strain transformation: ε_local = C^T × ε_phys × C
                // For 2D: ε_e1e1 = c11² ε₁₁ + c12² ε₂₂ + 2 c11 c12 ε₁₂
                let eps_11_local = c11*c11*eps_11_phys + c12*c12*eps_22_phys + 2.0*c11*c12*eps_12_phys;
                let eps_22_local = c21*c21*eps_11_phys + c22*c22*eps_22_phys + 2.0*c21*c22*eps_12_phys;
                let eps_12_local_2 = 2.0 * (c11*c21*eps_11_phys + c12*c22*eps_22_phys
                    + (c11*c22 + c12*c21)*eps_12_phys);

                let diff_11 = (eps_11_b - eps_11_local).abs();
                let diff_22 = (eps_22_b - eps_22_local).abs();
                let diff_12 = (eps_12_b - eps_12_local_2).abs();
                let scale = eps_11_b.abs().max(eps_22_b.abs()).max(eps_12_b.abs()).max(1e-15);

                if diff_11 / scale > 1e-6 || diff_22 / scale > 1e-6 || diff_12 / scale > 1e-6 {
                    println!("  MISMATCH node {} {}: B=[{:.6e},{:.6e},{:.6e}] cov=[{:.6e},{:.6e},{:.6e}] diff=[{:.2e},{:.2e},{:.2e}]",
                        node, dof_name, eps_11_b, eps_22_b, eps_12_b,
                        eps_11_local, eps_22_local, eps_12_local_2,
                        diff_11, diff_22, diff_12);
                } else {
                    println!("  OK node {} {}: ε₁₁={:.6e} ε₂₂={:.6e} 2ε₁₂={:.6e}",
                        node, dof_name, eps_11_b, eps_22_b, eps_12_b);
                }

                // Also check shear strain
                // Direct covariant shear:
                // 2ε₁₃^cov = ∂u/∂ξ · g₃ + ∂u/∂ζ · g₁
                // For translations at ζ=0: ∂u/∂ζ = 0
                let eps_13_cov_2 = dot3(&du_dxi_vec, &g3);  // ∂u/∂ξ · g₃ (no ∂u/∂ζ term)
                let eps_23_cov_2 = dot3(&du_deta_vec, &g3);  // ∂u/∂η · g₃

                // Physical shear: divide by metric
                let g3_norm = norm3(&g3);
                let eps_13_phys_2 = eps_13_cov_2 / (norm3(&g1) * g3_norm);
                let eps_23_phys_2 = eps_23_cov_2 / (norm3(&g2) * g3_norm);

                // Transform to local frame
                let eps_13_local_2x = 2.0 * (c11 * eps_13_phys_2 + c12 * eps_23_phys_2);
                let eps_23_local_2x = 2.0 * (c21 * eps_13_phys_2 + c22 * eps_23_phys_2);

                let diff_13 = (eps_13_b - eps_13_local_2x).abs();
                let diff_23 = (eps_23_b - eps_23_local_2x).abs();
                let shear_scale = eps_13_b.abs().max(eps_23_b.abs()).max(1e-15);

                if diff_13 / shear_scale > 1e-4 || diff_23 / shear_scale > 1e-4 {
                    println!("    SHEAR MISMATCH: B=[{:.6e},{:.6e}] cov=[{:.6e},{:.6e}] diff=[{:.2e},{:.2e}]",
                        eps_13_b, eps_23_b, eps_13_local_2x, eps_23_local_2x, diff_13, diff_23);
                }
            }
        }

        // Now check rotation DOFs
        println!("\n--- Rotation DOF strain comparison ---");
        for node in 0..4 {
            let d = &dirs[node];
            let cross_rx = [0.0, d[2], -d[1]];
            let cross_ry = [-d[2], 0.0, d[0]];
            let cross_rz = [d[1], -d[0], 0.0];
            let crosses = [cross_rx, cross_ry, cross_rz];

            for rot_idx in 0..3 {
                let col = node * 6 + 3 + rot_idx;
                let dof_name = ["rx", "ry", "rz"][rot_idx];
                let _cross = crosses[rot_idx];

                // B-matrix values
                let eps_11_b = b[0][col];
                let eps_22_b = b[1][col];

                // Direct covariant computation for rotation DOFs at ζ=0:
                // ∂u/∂ξ = ζ * h/2 * dN/dξ * (d × θ) = 0 at ζ=0
                // ∂u/∂η = ζ * h/2 * dN/dη * (d × θ) = 0 at ζ=0
                // ∂u/∂ζ = h/2 * N * (d × θ)
                // At ζ=0, only the through-thickness derivative survives
                // Membrane strain from through-thickness only = 0 (no ξ,η contribution)
                // The B-matrix should give ε₁₁ ≈ 0, ε₂₂ ≈ 0 for rotations at ζ=0
                // BUT with thickness integration (ζ≠0), the rotation DOFs DO contribute
                // to membrane strain via the ζ-dependent terms.

                // At ζ=0, the membrane strain from rotation DOFs comes from:
                // grad_u[k][ii] = inv_j[2][ii] * du_dzeta[k]
                //               = inv_j[2][ii] * half_h * N * cross[k]
                // This is the through-thickness gradient projected onto the tangent plane.

                println!("  Node {} {}: ε₁₁={:.6e} ε₂₂={:.6e} 2ε₁₂={:.6e} | 2ε₁₃={:.6e} 2ε₂₃={:.6e}",
                    node, dof_name, eps_11_b, eps_22_b, b[2][col], b[3][col], b[4][col]);
            }
        }

        // KEY TEST: Check that B-matrix for translations gives ZERO transverse shear
        // when ∂u/∂ζ = 0 (which it does for translations).
        // We proved analytically that L_13 = 0 (gradient in normal dir is zero).
        // But L_31 ≠ 0 generally. So 2ε₁₃ = L_31 (not zero on curved surfaces).
        println!("\n--- Translation DOF transverse shear (should reflect curvature coupling) ---");
        for node in 0..4 {
            for dof in 0..3 {
                let col = node * 6 + dof;
                let dof_name = ["ux", "uy", "uz"][dof];
                println!("  Node {} {}: 2ε₁₃={:.6e}, 2ε₂₃={:.6e}",
                    node, dof_name, b[3][col], b[4][col]);
            }
        }
    }

    /// Test hemisphere stiffness with ANS disabled — isolates shear tying effect.
    #[test]
    fn hemisphere_element_no_ans_comparison() {
        let r = 10.0;
        let h = 0.04;
        let e_val = 68250.0;
        let nu = 0.3;
        let pi = std::f64::consts::PI;
        let dphi = pi / 2.0 / 8.0;
        let dtheta = pi / 2.0 / 8.0;

        let coords = [
            [r, 0.0, 0.0],
            [r * dphi.cos(), 0.0, r * dphi.sin()],
            [r * dphi.cos() * dtheta.cos(), r * dphi.cos() * dtheta.sin(), r * dphi.sin()],
            [r * dtheta.cos(), r * dtheta.sin(), 0.0],
        ];
        let dirs = [
            [1.0, 0.0, 0.0],
            [dphi.cos(), 0.0, dphi.sin()],
            [dphi.cos() * dtheta.cos(), dphi.cos() * dtheta.sin(), dphi.sin()],
            [dtheta.cos(), dtheta.sin(), 0.0],
        ];

        let k_ans = curved_shell_stiffness(&coords, &dirs, e_val, nu, h);
        let k_no_ans = curved_shell_stiffness_no_ans(&coords, &dirs, e_val, nu, h);

        println!("\n=== Hemisphere element: ANS vs No-ANS eigenvalue comparison ===");

        // Compute diagonal comparison
        let mut max_diff = 0.0f64;
        for i in 0..24 {
            let diff = (k_ans[i * 24 + i] - k_no_ans[i * 24 + i]).abs();
            let scale = k_ans[i * 24 + i].abs().max(1e-15);
            if diff / scale > max_diff { max_diff = diff / scale; }
        }
        println!("Max relative diagonal difference (ANS vs no-ANS): {:.4e}", max_diff);

        // Frobenius norm comparison
        let frob_ans: f64 = k_ans.iter().map(|x| x * x).sum::<f64>().sqrt();
        let frob_no: f64 = k_no_ans.iter().map(|x| x * x).sum::<f64>().sqrt();
        println!("Frobenius: ANS={:.4e}, no-ANS={:.4e}, ratio={:.4}", frob_ans, frob_no, frob_ans / frob_no);

        // Compare membrane energy (uniform radial expansion)
        let mut u_rad = vec![0.0; 24];
        for i in 0..4 {
            u_rad[i * 6]     = dirs[i][0] * 0.001;
            u_rad[i * 6 + 1] = dirs[i][1] * 0.001;
            u_rad[i * 6 + 2] = dirs[i][2] * 0.001;
        }
        let e_ans = energy(&k_ans, &u_rad);
        let e_no = energy(&k_no_ans, &u_rad);
        println!("Radial expansion energy: ANS={:.6e}, no-ANS={:.6e}, ratio={:.4}", e_ans, e_no, e_ans / e_no);

        // Compare for a BENDING mode (rotation at one node only)
        let mut u_bend = vec![0.0; 24];
        u_bend[3] = 0.001; // rx at node 0
        let e_bend_ans = energy(&k_ans, &u_bend);
        let e_bend_no = energy(&k_no_ans, &u_bend);
        println!("Single-node rx energy: ANS={:.6e}, no-ANS={:.6e}, ratio={:.4}",
            e_bend_ans, e_bend_no, e_bend_ans / e_bend_no);

        // Compare for hemisphere-like mode: cos(2θ) radial
        let mut u_cos2 = vec![0.0; 24];
        for i in 0..4 {
            let theta = (coords[i][1]).atan2(coords[i][0]);
            let amp = 0.001 * (2.0 * theta).cos();
            u_cos2[i * 6]     = amp * dirs[i][0];
            u_cos2[i * 6 + 1] = amp * dirs[i][1];
            u_cos2[i * 6 + 2] = amp * dirs[i][2];
        }
        let e_cos2_ans = energy(&k_ans, &u_cos2);
        let e_cos2_no = energy(&k_no_ans, &u_cos2);
        println!("cos(2θ) radial energy: ANS={:.6e}, no-ANS={:.6e}, ratio={:.4}",
            e_cos2_ans, e_cos2_no, e_cos2_ans / e_cos2_no);
    }

    fn energy(k: &[f64], u: &[f64]) -> f64 {
        let n = u.len();
        let mut ku = vec![0.0; n];
        for i in 0..n {
            for j in 0..n {
                ku[i] += k[i * n + j] * u[j];
            }
        }
        0.5 * ku.iter().zip(u.iter()).map(|(a, b)| a * b).sum::<f64>()
    }

    /// Compare covariant vs Cartesian B-matrix approaches at the stiffness matrix level.
    ///
    /// Creates a hemisphere element and computes K with both approaches.
    /// Compares Frobenius norms, diagonal sums, and energy for radial expansion mode.
    /// Prints detailed diagnostics to quantify the difference.
    #[test]
    fn hemisphere_covariant_vs_cartesian_stiffness() {
        let r = 10.0;
        let t = 0.04;
        let e_val = 68250.0;
        let nu = 0.3;
        let pi = std::f64::consts::PI;
        let dphi = pi / 2.0 / 8.0;   // 11.25 degrees
        let dtheta = pi / 2.0 / 8.0;

        let coords = [
            [r, 0.0, 0.0],
            [r * dphi.cos(), 0.0, r * dphi.sin()],
            [r * dphi.cos() * dtheta.cos(), r * dphi.cos() * dtheta.sin(), r * dphi.sin()],
            [r * dtheta.cos(), r * dtheta.sin(), 0.0],
        ];
        // Exact surface normals (outward radial)
        let dirs = [
            [1.0, 0.0, 0.0],
            [dphi.cos(), 0.0, dphi.sin()],
            [dphi.cos() * dtheta.cos(), dphi.cos() * dtheta.sin(), dphi.sin()],
            [dtheta.cos(), dtheta.sin(), 0.0],
        ];

        // Compute stiffness with both approaches
        let k_cart = curved_shell_stiffness(&coords, &dirs, e_val, nu, t);
        let k_cov = curved_shell_stiffness_covariant(&coords, &dirs, e_val, nu, t);

        println!("\n======================================================================");
        println!("=== COVARIANT vs CARTESIAN stiffness comparison (hemisphere element) ===");
        println!("======================================================================");
        println!("R={r}, t={t}, E={e_val}, nu={nu}");
        println!("dphi=dtheta={:.4} rad ({:.2} deg)", dphi, dphi.to_degrees());
        println!();

        // --- Frobenius norms ---
        let frob_cart: f64 = k_cart.iter().map(|x| x * x).sum::<f64>().sqrt();
        let frob_cov: f64 = k_cov.iter().map(|x| x * x).sum::<f64>().sqrt();
        let frob_diff: f64 = k_cart.iter().zip(k_cov.iter())
            .map(|(a, b)| (a - b) * (a - b)).sum::<f64>().sqrt();
        let frob_rel = frob_diff / frob_cart;
        println!("Frobenius norms:");
        println!("  Cartesian:  {frob_cart:.6e}");
        println!("  Covariant:  {frob_cov:.6e}");
        println!("  ||K_cart - K_cov||_F = {frob_diff:.6e}");
        println!("  Relative difference: {frob_rel:.6e} ({:.4}%)", frob_rel * 100.0);
        println!();

        // --- Diagonal sums ---
        let diag_cart: f64 = (0..24).map(|i| k_cart[i * 24 + i]).sum();
        let diag_cov: f64 = (0..24).map(|i| k_cov[i * 24 + i]).sum();
        let diag_rel = (diag_cart - diag_cov).abs() / diag_cart.abs();
        println!("Diagonal sums:");
        println!("  Cartesian: {diag_cart:.6e}");
        println!("  Covariant: {diag_cov:.6e}");
        println!("  Relative difference: {diag_rel:.6e} ({:.4}%)", diag_rel * 100.0);
        println!();

        // --- Per-DOF-type diagonal comparison ---
        println!("Translation diagonal comparison (Cartesian / Covariant / ratio):");
        let mut max_trans_rel = 0.0f64;
        for i in 0..4 {
            for d in 0..3 {
                let idx = i * 6 + d;
                let c = k_cart[idx * 24 + idx];
                let v = k_cov[idx * 24 + idx];
                let ratio = v / c;
                let rel = (c - v).abs() / c.abs().max(1e-30);
                max_trans_rel = max_trans_rel.max(rel);
                let label = ["ux", "uy", "uz"][d];
                println!("  Node {i} {label}: {c:.6e} / {v:.6e}  ratio={ratio:.6}  rel_diff={rel:.4e}");
            }
        }
        println!("  Max relative translation diagonal diff: {max_trans_rel:.4e} ({:.4}%)", max_trans_rel * 100.0);
        println!();

        println!("Rotation diagonal comparison (Cartesian / Covariant / ratio):");
        let mut max_rot_rel = 0.0f64;
        for i in 0..4 {
            for d in 0..3 {
                let idx = i * 6 + 3 + d;
                let c = k_cart[idx * 24 + idx];
                let v = k_cov[idx * 24 + idx];
                let ratio = v / c;
                let rel = (c - v).abs() / c.abs().max(1e-30);
                max_rot_rel = max_rot_rel.max(rel);
                let label = ["rx", "ry", "rz"][d];
                println!("  Node {i} {label}: {c:.6e} / {v:.6e}  ratio={ratio:.6}  rel_diff={rel:.4e}");
            }
        }
        println!("  Max relative rotation diagonal diff: {max_rot_rel:.4e} ({:.4}%)", max_rot_rel * 100.0);
        println!();

        // --- Energy for radial expansion mode ---
        let delta = 0.001;
        let mut u_rad = vec![0.0; 24];
        for i in 0..4 {
            u_rad[i * 6]     = delta * dirs[i][0];
            u_rad[i * 6 + 1] = delta * dirs[i][1];
            u_rad[i * 6 + 2] = delta * dirs[i][2];
        }
        let e_cart = energy(&k_cart, &u_rad);
        let e_cov = energy(&k_cov, &u_rad);
        let e_rel = (e_cart - e_cov).abs() / e_cart.abs().max(1e-30);
        println!("Radial expansion mode (uniform delta={delta}):");
        println!("  Cartesian energy: {e_cart:.8e}");
        println!("  Covariant energy: {e_cov:.8e}");
        println!("  Relative difference: {e_rel:.6e} ({:.4}%)", e_rel * 100.0);
        println!();

        // --- Energy for cos(2*theta) radial mode ---
        let mut u_cos2 = vec![0.0; 24];
        for i in 0..4 {
            let theta = coords[i][1].atan2(coords[i][0]);
            let amp = 0.001 * (2.0 * theta).cos();
            u_cos2[i * 6]     = amp * dirs[i][0];
            u_cos2[i * 6 + 1] = amp * dirs[i][1];
            u_cos2[i * 6 + 2] = amp * dirs[i][2];
        }
        let e_cos2_cart = energy(&k_cart, &u_cos2);
        let e_cos2_cov = energy(&k_cov, &u_cos2);
        let e_cos2_rel = (e_cos2_cart - e_cos2_cov).abs() / e_cos2_cart.abs().max(1e-30);
        println!("cos(2*theta) radial mode:");
        println!("  Cartesian energy: {e_cos2_cart:.8e}");
        println!("  Covariant energy: {e_cos2_cov:.8e}");
        println!("  Relative difference: {e_cos2_rel:.6e} ({:.4}%)", e_cos2_rel * 100.0);
        println!();

        // --- Energy for single-node bending mode ---
        let mut u_bend = vec![0.0; 24];
        u_bend[3] = 0.001; // rx at node 0
        let e_bend_cart = energy(&k_cart, &u_bend);
        let e_bend_cov = energy(&k_cov, &u_bend);
        let e_bend_rel = (e_bend_cart - e_bend_cov).abs() / e_bend_cart.abs().max(1e-30);
        println!("Single-node bending mode (rx at node 0):");
        println!("  Cartesian energy: {e_bend_cart:.8e}");
        println!("  Covariant energy: {e_bend_cov:.8e}");
        println!("  Relative difference: {e_bend_rel:.6e} ({:.4}%)", e_bend_rel * 100.0);
        println!();

        // --- Element-level maximum entry-wise difference ---
        let mut max_entry_diff = 0.0f64;
        let mut max_entry_rel = 0.0f64;
        let mut max_entry_ij = (0, 0);
        for i in 0..24 {
            for j in 0..24 {
                let c = k_cart[i * 24 + j];
                let v = k_cov[i * 24 + j];
                let diff = (c - v).abs();
                let rel = diff / c.abs().max(1e-30);
                if diff > max_entry_diff {
                    max_entry_diff = diff;
                    max_entry_ij = (i, j);
                }
                if c.abs() > 1e-10 && rel > max_entry_rel {
                    max_entry_rel = rel;
                }
            }
        }
        println!("Maximum entry-wise absolute difference: {max_entry_diff:.6e} at K[{},{}]",
            max_entry_ij.0, max_entry_ij.1);
        println!("Maximum entry-wise relative difference (for |K|>1e-10): {max_entry_rel:.6e} ({:.4}%)",
            max_entry_rel * 100.0);
        println!();

        // --- Symmetry check on covariant K ---
        let mut max_sym = 0.0f64;
        for i in 0..24 {
            for j in (i + 1)..24 {
                let diff = (k_cov[i * 24 + j] - k_cov[j * 24 + i]).abs();
                let scale = k_cov[i * 24 + j].abs().max(k_cov[j * 24 + i].abs()).max(1e-30);
                let rel = diff / scale;
                max_sym = max_sym.max(rel);
            }
        }
        println!("Covariant K symmetry check: max relative asymmetry = {max_sym:.4e}");

        // --- Positive diagonal check ---
        let mut all_positive = true;
        for i in 0..24 {
            if k_cov[i * 24 + i] <= 0.0 {
                println!("WARNING: K_cov[{i},{i}] = {:.4e} is non-positive!", k_cov[i * 24 + i]);
                all_positive = false;
            }
        }
        if all_positive {
            println!("Covariant K: all diagonal entries positive");
        }
        println!();

        // --- Also test on a FLAT element for reference (should give very close results) ---
        let flat_coords = [
            [0.0, 0.0, 0.0],
            [r * dphi, 0.0, 0.0],
            [r * dphi, r * dtheta, 0.0],
            [0.0, r * dtheta, 0.0],
        ];
        let flat_dirs = [[0.0, 0.0, 1.0]; 4];
        let k_flat_cart = curved_shell_stiffness(&flat_coords, &flat_dirs, e_val, nu, t);
        let k_flat_cov = curved_shell_stiffness_covariant(&flat_coords, &flat_dirs, e_val, nu, t);
        let flat_frob_diff: f64 = k_flat_cart.iter().zip(k_flat_cov.iter())
            .map(|(a, b)| (a - b) * (a - b)).sum::<f64>().sqrt();
        let flat_frob_cart: f64 = k_flat_cart.iter().map(|x| x * x).sum::<f64>().sqrt();
        let flat_frob_rel = flat_frob_diff / flat_frob_cart;
        println!("--- FLAT element reference ---");
        println!("  ||K_cart - K_cov||_F / ||K_cart||_F = {flat_frob_rel:.6e} ({:.4}%)", flat_frob_rel * 100.0);

        // For flat elements, the two approaches should be nearly identical
        // (any difference is purely numerical, not geometric)
        let mut flat_u_biax = vec![0.0; 24];
        for i in 0..4 {
            flat_u_biax[i * 6] = 0.001 * flat_coords[i][0];
            flat_u_biax[i * 6 + 1] = 0.001 * flat_coords[i][1];
        }
        let flat_e_cart = energy(&k_flat_cart, &flat_u_biax);
        let flat_e_cov = energy(&k_flat_cov, &flat_u_biax);
        let flat_e_rel = (flat_e_cart - flat_e_cov).abs() / flat_e_cart.abs().max(1e-30);
        println!("  Biaxial energy: cart={flat_e_cart:.8e}, cov={flat_e_cov:.8e}, rel={flat_e_rel:.6e}");
        println!();

        // --- Summary ---
        println!("=== SUMMARY ===");
        println!("Hemisphere element Frobenius relative diff: {:.4}%", frob_rel * 100.0);
        println!("Hemisphere radial expansion energy diff:    {:.4}%", e_rel * 100.0);
        println!("Hemisphere bending energy diff:             {:.4}%", e_bend_rel * 100.0);
        println!("Flat element Frobenius relative diff:       {:.4}%", flat_frob_rel * 100.0);
        println!();
        if frob_rel > 0.01 {
            println!("** SIGNIFICANT DIFFERENCE (>{:.1}%) between Cartesian and covariant B-matrix **", frob_rel * 100.0);
            println!("** This suggests the Jacobian-inverse approach may have an issue on curved surfaces **");
        } else if frob_rel > 0.001 {
            println!("Moderate difference ({:.4}%) -- may indicate subtle geometric coupling issue", frob_rel * 100.0);
        } else {
            println!("Small difference ({:.6}%) -- both approaches are consistent", frob_rel * 100.0);
        }

        // The test should not fail -- it's diagnostic. But we verify basic sanity:
        // 1. Covariant K must be symmetric
        assert!(max_sym < 1e-8,
            "Covariant K is not symmetric: max relative asymmetry = {max_sym:.4e}");
        // 2. All diagonals must be positive
        assert!(all_positive, "Covariant K has non-positive diagonal entries");
        // 3. Flat element difference should be very small (< 0.01%)
        assert!(flat_frob_rel < 1e-4,
            "Flat element approaches differ too much: {:.6e}", flat_frob_rel);
    }
}
