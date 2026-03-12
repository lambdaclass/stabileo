/// MITC9 quadrilateral shell element (Bucalem & Bathe 1993).
///
/// 9-node shell with 54 DOFs (6 per node: ux, uy, uz, rx, ry, rz).
/// Combines:
/// - Quadratic (Lagrange) membrane and bending fields
/// - 3×3 Gauss integration
/// - MITC9 assumed natural strain (ANS) transverse shear tying
/// - Hughes-Brezzi drilling DOF stabilization
///
/// The quadratic displacement field largely eliminates membrane locking,
/// making this element suitable for thin curved shells (R/t > 100) where
/// MITC4 performs poorly (e.g. pinched hemisphere, twisted beam).
///
/// Node numbering:
/// ```text
/// 4---7---3      Natural coords:
/// |       |      1:(-1,-1) 2:(+1,-1) 3:(+1,+1) 4:(-1,+1)
/// 8   9   6      5:(0,-1) 6:(+1,0) 7:(0,+1) 8:(-1,0) 9:(0,0)
/// |       |
/// 1---5---2
/// ```
///
/// References:
///   - Bucalem & Bathe (1993): "Higher-order MITC general shell elements"
///   - Bathe & Dvorkin (1986): "A formulation of general shell elements"
///   - Hughes & Brezzi (1989): Drilling rotations formulation

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

// ==================== Shape Functions ====================

/// 9-node Lagrange shape functions at (ξ, η).
///
/// Node ordering: corners 0-3 at (±1,±1), midsides 4-7, center 8.
pub fn shape_functions_9(xi: f64, eta: f64) -> [f64; 9] {
    let xi2 = xi * xi;
    let eta2 = eta * eta;

    // Corner nodes (0-3): ¼ξᵢξ(1+ξᵢξ) ηᵢη(1+ηᵢη)
    // = ¼ξη(ξ+ξᵢ)(η+ηᵢ) for corners at (ξᵢ,ηᵢ)
    let n0 = 0.25 * xi * (xi - 1.0) * eta * (eta - 1.0); // (-1,-1)
    let n1 = 0.25 * xi * (xi + 1.0) * eta * (eta - 1.0); // (+1,-1)
    let n2 = 0.25 * xi * (xi + 1.0) * eta * (eta + 1.0); // (+1,+1)
    let n3 = 0.25 * xi * (xi - 1.0) * eta * (eta + 1.0); // (-1,+1)

    // Midside nodes (4-7): ½(1-ξ²)η(η+ηᵢ) or ½ξ(ξ+ξᵢ)(1-η²)
    let n4 = 0.5 * (1.0 - xi2) * eta * (eta - 1.0); // (0,-1)
    let n5 = 0.5 * xi * (xi + 1.0) * (1.0 - eta2); // (+1,0)
    let n6 = 0.5 * (1.0 - xi2) * eta * (eta + 1.0); // (0,+1)
    let n7 = 0.5 * xi * (xi - 1.0) * (1.0 - eta2); // (-1,0)

    // Center node (8): (1-ξ²)(1-η²)
    let n8 = (1.0 - xi2) * (1.0 - eta2);

    [n0, n1, n2, n3, n4, n5, n6, n7, n8]
}

/// Derivatives of 9-node shape functions w.r.t. (ξ, η).
/// Returns (dN/dξ[9], dN/dη[9]).
pub fn shape_derivatives_9(xi: f64, eta: f64) -> ([f64; 9], [f64; 9]) {
    let xi2 = xi * xi;
    let eta2 = eta * eta;

    let mut dn_dxi = [0.0; 9];
    let mut dn_deta = [0.0; 9];

    // Corner nodes
    // N0 = ¼ξ(ξ-1)η(η-1)
    dn_dxi[0] = 0.25 * (2.0 * xi - 1.0) * eta * (eta - 1.0);
    dn_deta[0] = 0.25 * xi * (xi - 1.0) * (2.0 * eta - 1.0);

    // N1 = ¼ξ(ξ+1)η(η-1)
    dn_dxi[1] = 0.25 * (2.0 * xi + 1.0) * eta * (eta - 1.0);
    dn_deta[1] = 0.25 * xi * (xi + 1.0) * (2.0 * eta - 1.0);

    // N2 = ¼ξ(ξ+1)η(η+1)
    dn_dxi[2] = 0.25 * (2.0 * xi + 1.0) * eta * (eta + 1.0);
    dn_deta[2] = 0.25 * xi * (xi + 1.0) * (2.0 * eta + 1.0);

    // N3 = ¼ξ(ξ-1)η(η+1)
    dn_dxi[3] = 0.25 * (2.0 * xi - 1.0) * eta * (eta + 1.0);
    dn_deta[3] = 0.25 * xi * (xi - 1.0) * (2.0 * eta + 1.0);

    // Midside nodes
    // N4 = ½(1-ξ²)η(η-1)
    dn_dxi[4] = -xi * eta * (eta - 1.0);
    dn_deta[4] = 0.5 * (1.0 - xi2) * (2.0 * eta - 1.0);

    // N5 = ½ξ(ξ+1)(1-η²)
    dn_dxi[5] = 0.5 * (2.0 * xi + 1.0) * (1.0 - eta2);
    dn_deta[5] = -xi * (xi + 1.0) * eta;

    // N6 = ½(1-ξ²)η(η+1)
    dn_dxi[6] = -xi * eta * (eta + 1.0);
    dn_deta[6] = 0.5 * (1.0 - xi2) * (2.0 * eta + 1.0);

    // N7 = ½ξ(ξ-1)(1-η²)
    dn_dxi[7] = 0.5 * (2.0 * xi - 1.0) * (1.0 - eta2);
    dn_deta[7] = -xi * (xi - 1.0) * eta;

    // Center node
    // N8 = (1-ξ²)(1-η²)
    dn_dxi[8] = -2.0 * xi * (1.0 - eta2);
    dn_deta[8] = -2.0 * eta * (1.0 - xi2);

    (dn_dxi, dn_deta)
}

// ==================== Quadrature ====================

/// 3×3 Gauss quadrature points and weights (9 points).
fn gauss_3x3() -> [((f64, f64), f64); 9] {
    let g = (3.0_f64 / 5.0).sqrt(); // √(3/5)
    let w1 = 5.0 / 9.0;
    let w2 = 8.0 / 9.0;

    let pts_1d = [-g, 0.0, g];
    let wts_1d = [w1, w2, w1];

    let mut gp = [((0.0, 0.0), 0.0); 9];
    let mut idx = 0;
    for j in 0..3 {
        for i in 0..3 {
            gp[idx] = ((pts_1d[i], pts_1d[j]), wts_1d[i] * wts_1d[j]);
            idx += 1;
        }
    }
    gp
}

// ==================== Local Axes & Projection ====================

/// Compute local orthonormal axes from the 9 quad nodes.
/// Uses corner diagonals (1→3, 2→4) to find the normal.
pub fn quad9_local_axes(coords: &[[f64; 3]; 9]) -> ([f64; 3], [f64; 3], [f64; 3]) {
    // Diagonals from corners only
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

/// Project 9 nodes to 2D local plane.
fn project_to_2d_9(
    coords: &[[f64; 3]; 9],
    ex: &[f64; 3],
    ey: &[f64; 3],
) -> [[f64; 2]; 9] {
    let o = coords[0];
    let mut pts = [[0.0; 2]; 9];
    for i in 0..9 {
        let d = sub3(&coords[i], &o);
        pts[i] = [dot3(&d, ex), dot3(&d, ey)];
    }
    pts
}

/// Compute Jacobian for 9-node element at (ξ, η).
fn jacobian_2d_9(
    pts: &[[f64; 2]; 9],
    xi: f64,
    eta: f64,
) -> ([[f64; 2]; 2], [[f64; 2]; 2], f64) {
    let (dn_dxi, dn_deta) = shape_derivatives_9(xi, eta);

    let mut j = [[0.0; 2]; 2];
    for i in 0..9 {
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

// ==================== ANS Shear Tying ====================

/// Compute covariant transverse shear B-matrix (2×54) at (ξ, η) for 9 nodes.
///
/// Row 0 = e_ξz (covariant shear in ξ direction)
/// Row 1 = e_ηz (covariant shear in η direction)
fn shear_b_nat_9(pts: &[[f64; 2]; 9], xi: f64, eta: f64) -> [[f64; 54]; 2] {
    let (j, _, _) = jacobian_2d_9(pts, xi, eta);
    let (dn_dxi, dn_deta) = shape_derivatives_9(xi, eta);
    let n = shape_functions_9(xi, eta);

    let mut b_nat = [[0.0; 54]; 2];
    for i in 0..9 {
        let di = i * 6;
        // e_ξz = ∂w/∂ξ + J₁₁·N_i·θ_y − J₁₂·N_i·θ_x
        b_nat[0][di + 2] = dn_dxi[i];           // w (uz)
        b_nat[0][di + 3] = -j[0][1] * n[i];     // θ_x (rx)
        b_nat[0][di + 4] = j[0][0] * n[i];      // θ_y (ry)
        // e_ηz = ∂w/∂η + J₂₁·N_i·θ_y − J₂₂·N_i·θ_x
        b_nat[1][di + 2] = dn_deta[i];           // w (uz)
        b_nat[1][di + 3] = -j[1][1] * n[i];     // θ_x (rx)
        b_nat[1][di + 4] = j[1][0] * n[i];      // θ_y (ry)
    }
    b_nat
}

/// 1D quadratic Lagrange basis on nodes {-1, 0, +1}.
///
/// L0(s) = s(s-1)/2, L1(s) = 1-s², L2(s) = s(s+1)/2
fn lagrange_1d_3(s: f64) -> [f64; 3] {
    [
        0.5 * s * (s - 1.0),
        1.0 - s * s,
        0.5 * s * (s + 1.0),
    ]
}

// ==================== Stiffness Matrix ====================

/// Compute 54×54 MITC9 local stiffness matrix.
///
/// coords: 9 node coordinates in 3D [x,y,z].
/// e: Young's modulus (kN/m²)
/// nu: Poisson's ratio
/// t: shell thickness (m)
///
/// Uses Bucalem & Bathe (1993) ANS interpolation for transverse shear.
/// Returns 2916-element Vec (54×54 row-major).
pub fn mitc9_local_stiffness(
    coords: &[[f64; 3]; 9],
    e: f64,
    nu: f64,
    t: f64,
) -> Vec<f64> {
    let (ex, ey, _ez) = quad9_local_axes(coords);
    let pts = project_to_2d_9(coords, &ex, &ey);

    let ndof = 54;
    let mut k = vec![0.0; ndof * ndof];

    // Material matrices
    let factor = e * t / (1.0 - nu * nu);
    let d_m = [
        factor, factor * nu, 0.0,
        factor * nu, factor, 0.0,
        0.0, 0.0, factor * (1.0 - nu) / 2.0,
    ];

    let factor_b = e * t * t * t / (12.0 * (1.0 - nu * nu));
    let d_b = [
        factor_b, factor_b * nu, 0.0,
        factor_b * nu, factor_b, 0.0,
        0.0, 0.0, factor_b * (1.0 - nu) / 2.0,
    ];

    let g = e / (2.0 * (1.0 + nu));
    let kappa = 5.0 / 6.0;
    let d_s = kappa * g * t;

    // Drilling stiffness parameter (Hughes-Brezzi)
    let alpha_drill = factor * (1.0 - nu) / 2.0 * 1e-3;

    let gauss = gauss_3x3();

    // --- MITC9 ANS tying points (Bucalem & Bathe 1993) ---
    // For e_ξz (e13): 6 tying points on a 2×3 grid
    //   ξ = ±1/√3, η = {-1, 0, +1}
    let g1 = 1.0 / 3.0_f64.sqrt();
    let e13_tying_pts: [(f64, f64); 6] = [
        (-g1, -1.0), (-g1, 0.0), (-g1, 1.0),
        ( g1, -1.0), ( g1, 0.0), ( g1, 1.0),
    ];
    // For e_ηz (e23): 6 tying points on a 3×2 grid
    //   ξ = {-1, 0, +1}, η = ±1/√3
    let e23_tying_pts: [(f64, f64); 6] = [
        (-1.0, -g1), (0.0, -g1), (1.0, -g1),
        (-1.0,  g1), (0.0,  g1), (1.0,  g1),
    ];

    // Pre-compute covariant shear B at tying points
    let mut b_e13_ty = [[[0.0f64; 54]; 2]; 6]; // row 0 is e_ξz at each tying point
    let mut b_e23_ty = [[[0.0f64; 54]; 2]; 6]; // row 1 is e_ηz at each tying point
    for (tp, &(xi_t, eta_t)) in e13_tying_pts.iter().enumerate() {
        b_e13_ty[tp] = shear_b_nat_9(&pts, xi_t, eta_t);
    }
    for (tp, &(xi_t, eta_t)) in e23_tying_pts.iter().enumerate() {
        b_e23_ty[tp] = shear_b_nat_9(&pts, xi_t, eta_t);
    }

    for &((xi, eta), w_g) in &gauss {
        let (_j, inv_j, det_j) = jacobian_2d_9(&pts, xi, eta);
        let (dn_dxi, dn_deta) = shape_derivatives_9(xi, eta);
        let n = shape_functions_9(xi, eta);
        let dv = det_j.abs() * w_g;

        // Physical derivatives
        let mut dn_dx = [0.0; 9];
        let mut dn_dy = [0.0; 9];
        for i in 0..9 {
            dn_dx[i] = inv_j[0][0] * dn_dxi[i] + inv_j[0][1] * dn_deta[i];
            dn_dy[i] = inv_j[1][0] * dn_dxi[i] + inv_j[1][1] * dn_deta[i];
        }

        // --- Membrane contribution ---
        for i in 0..9 {
            for j in 0..9 {
                let di = i * 6;
                let dj = j * 6;

                // k[ux_i, ux_j]
                k[di * ndof + dj] += dv * (
                    dn_dx[i] * d_m[0] * dn_dx[j] +
                    dn_dy[i] * d_m[8] * dn_dy[j]
                );
                // k[ux_i, uy_j]
                k[di * ndof + dj + 1] += dv * (
                    dn_dx[i] * d_m[1] * dn_dy[j] +
                    dn_dy[i] * d_m[8] * dn_dx[j]
                );
                // k[uy_i, ux_j]
                k[(di + 1) * ndof + dj] += dv * (
                    dn_dy[i] * d_m[3] * dn_dx[j] +
                    dn_dx[i] * d_m[8] * dn_dy[j]
                );
                // k[uy_i, uy_j]
                k[(di + 1) * ndof + dj + 1] += dv * (
                    dn_dy[i] * d_m[4] * dn_dy[j] +
                    dn_dx[i] * d_m[8] * dn_dx[j]
                );
            }
        }

        // --- Bending contribution ---
        for i in 0..9 {
            for j in 0..9 {
                let di = i * 6;
                let dj = j * 6;

                // k[rx_i, rx_j]: κyy-κyy + κxy-κxy
                k[(di + 3) * ndof + dj + 3] += dv * (
                    dn_dy[i] * d_b[4] * dn_dy[j] +
                    dn_dx[i] * d_b[8] * dn_dx[j]
                );
                // k[rx_i, ry_j]: κyy-κxx + κxy cross
                k[(di + 3) * ndof + dj + 4] += dv * (
                    dn_dy[i] * d_b[3] * (-dn_dx[j]) +
                    dn_dx[i] * d_b[8] * (-dn_dy[j])
                );
                // k[ry_i, rx_j]: symmetric
                k[(di + 4) * ndof + dj + 3] += dv * (
                    (-dn_dx[i]) * d_b[1] * dn_dy[j] +
                    (-dn_dy[i]) * d_b[8] * dn_dx[j]
                );
                // k[ry_i, ry_j]: κxx-κxx + κxy-κxy
                k[(di + 4) * ndof + dj + 4] += dv * (
                    (-dn_dx[i]) * d_b[0] * (-dn_dx[j]) +
                    (-dn_dy[i]) * d_b[8] * (-dn_dy[j])
                );
            }
        }

        // --- Transverse shear (MITC9 ANS — Bucalem & Bathe 1993) ---
        // Interpolate from tying points using products of 1D Lagrange polynomials.
        //
        // e_ξz: 6 tying points on 2×3 grid (ξ at ±1/√3, η at -1,0,+1)
        //   L_ξ(ξ): 2-point Lagrange at ±1/√3
        //   L_η(η): 3-point Lagrange at -1,0,+1
        //   Interpolation: ẽ_ξz(ξ,η) = Σ L_ξ_a(ξ) · L_η_b(η) · e_ξz(tp_ab)
        //
        // e_ηz: 6 tying points on 3×2 grid (ξ at -1,0,+1, η at ±1/√3)
        {
            // 2-point Lagrange interpolation at ±1/√3
            let l_xi_2 = [
                0.5 * (1.0 - xi / g1), // at -g1
                0.5 * (1.0 + xi / g1), // at +g1
            ];
            let l_eta_3 = lagrange_1d_3(eta);

            let l_eta_2 = [
                0.5 * (1.0 - eta / g1),
                0.5 * (1.0 + eta / g1),
            ];
            let l_xi_3 = lagrange_1d_3(xi);

            // Interpolate e_ξz from 2×3 tying grid
            let mut b_nat_tied = [[0.0; 54]; 2];
            for col in 0..54 {
                // e_ξz: sum over 2(ξ) × 3(η)
                for a in 0..2 {
                    for b in 0..3 {
                        let tp = a * 3 + b;
                        b_nat_tied[0][col] += l_xi_2[a] * l_eta_3[b] * b_e13_ty[tp][0][col];
                    }
                }
                // e_ηz: sum over 3(ξ) × 2(η)
                for a in 0..3 {
                    for b in 0..2 {
                        let tp = b * 3 + a;
                        b_nat_tied[1][col] += l_xi_3[a] * l_eta_2[b] * b_e23_ty[tp][1][col];
                    }
                }
            }

            // Transform to physical: B_phys = J⁻¹ · B̃_nat
            let mut b_phys = [[0.0; 54]; 2];
            for col in 0..54 {
                b_phys[0][col] = inv_j[0][0] * b_nat_tied[0][col] + inv_j[0][1] * b_nat_tied[1][col];
                b_phys[1][col] = inv_j[1][0] * b_nat_tied[0][col] + inv_j[1][1] * b_nat_tied[1][col];
            }

            // k += B_phys^T · D_s · B_phys · dV
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
        for i in 0..9 {
            for j in 0..9 {
                let di = i * 6 + 5;
                let dj = j * 6 + 5;
                k[di * ndof + dj] += dv * alpha_drill * n[i] * n[j];
            }
        }
    }

    // Symmetrize (ANS tying can introduce tiny numerical asymmetry)
    for i in 0..ndof {
        for j in (i + 1)..ndof {
            let avg = 0.5 * (k[i * ndof + j] + k[j * ndof + i]);
            k[i * ndof + j] = avg;
            k[j * ndof + i] = avg;
        }
    }

    k
}

// ==================== Transformation ====================

/// Build 54×54 rotation matrix from local to global for the quad9 element.
pub fn quad9_transform_3d(coords: &[[f64; 3]; 9]) -> Vec<f64> {
    let (ex, ey, ez) = quad9_local_axes(coords);

    let r = [
        [ex[0], ey[0], ez[0]],
        [ex[1], ey[1], ez[1]],
        [ex[2], ey[2], ez[2]],
    ];

    let mut t = vec![0.0; 54 * 54];
    for node in 0..9 {
        for block in 0..2 {
            let offset = node * 6 + block * 3;
            for i in 0..3 {
                for j in 0..3 {
                    t[(offset + i) * 54 + (offset + j)] = r[i][j];
                }
            }
        }
    }
    t
}

// ==================== Mass Matrix ====================

/// Compute quad9 consistent mass matrix (54×54).
pub fn quad9_consistent_mass(
    coords: &[[f64; 3]; 9],
    rho: f64,
    t: f64,
) -> Vec<f64> {
    let (ex, ey, _) = quad9_local_axes(coords);
    let pts = project_to_2d_9(coords, &ex, &ey);
    let ndof = 54;
    let mut m = vec![0.0; ndof * ndof];

    let gauss = gauss_3x3();

    for &((xi, eta), w_g) in &gauss {
        let (_, _, det_j) = jacobian_2d_9(&pts, xi, eta);
        let n = shape_functions_9(xi, eta);
        let dv = det_j.abs() * w_g;

        for i in 0..9 {
            for j in 0..9 {
                let di = i * 6;
                let dj = j * 6;
                let m_val = rho * t * dv * n[i] * n[j];

                // Translational mass (ux, uy, uz)
                for d in 0..3 {
                    m[(di + d) * ndof + (dj + d)] += m_val;
                }

                // Rotary inertia (rx, ry)
                let m_rot = rho * t * t * t / 12.0 * dv * n[i] * n[j];
                m[(di + 3) * ndof + (dj + 3)] += m_rot;
                m[(di + 4) * ndof + (dj + 4)] += m_rot;
            }
        }
    }

    m
}

// ==================== Geometric Stiffness ====================

/// Compute quad9 geometric stiffness matrix (54×54) for buckling.
pub fn quad9_geometric_stiffness(
    coords: &[[f64; 3]; 9],
    nxx: f64,
    nyy: f64,
    nxy: f64,
) -> Vec<f64> {
    let (ex, ey, _) = quad9_local_axes(coords);
    let pts = project_to_2d_9(coords, &ex, &ey);
    let ndof = 54;
    let mut kg = vec![0.0; ndof * ndof];

    let gauss = gauss_3x3();

    for &((xi, eta), w_g) in &gauss {
        let (_, inv_j, det_j) = jacobian_2d_9(&pts, xi, eta);
        let (dn_dxi, dn_deta) = shape_derivatives_9(xi, eta);
        let dv = det_j.abs() * w_g;

        let mut dn_dx = [0.0; 9];
        let mut dn_dy = [0.0; 9];
        for i in 0..9 {
            dn_dx[i] = inv_j[0][0] * dn_dxi[i] + inv_j[0][1] * dn_deta[i];
            dn_dy[i] = inv_j[1][0] * dn_dxi[i] + inv_j[1][1] * dn_deta[i];
        }

        for i in 0..9 {
            for j in 0..9 {
                let val = nxx * dn_dx[i] * dn_dx[j]
                    + nyy * dn_dy[i] * dn_dy[j]
                    + nxy * (dn_dx[i] * dn_dy[j] + dn_dy[i] * dn_dx[j]);

                let di = i * 6 + 2; // uz
                let dj = j * 6 + 2;
                kg[di * ndof + dj] += dv * val;
            }
        }
    }

    kg
}

// ==================== Stress Recovery ====================

/// Compute quad9 element stresses at centroid from nodal displacements (local).
pub fn quad9_stresses(
    coords: &[[f64; 3]; 9],
    u_local: &[f64],
    e: f64,
    nu: f64,
    t: f64,
) -> crate::element::quad::QuadStressResult {
    let (ex, ey, _) = quad9_local_axes(coords);
    let pts = project_to_2d_9(coords, &ex, &ey);

    // Evaluate at centroid
    let (_, inv_j, _) = jacobian_2d_9(&pts, 0.0, 0.0);
    let (dn_dxi, dn_deta) = shape_derivatives_9(0.0, 0.0);

    let mut dn_dx = [0.0; 9];
    let mut dn_dy = [0.0; 9];
    for i in 0..9 {
        dn_dx[i] = inv_j[0][0] * dn_dxi[i] + inv_j[0][1] * dn_deta[i];
        dn_dy[i] = inv_j[1][0] * dn_dxi[i] + inv_j[1][1] * dn_deta[i];
    }

    let mut eps_xx = 0.0;
    let mut eps_yy = 0.0;
    let mut gamma_xy = 0.0;
    for i in 0..9 {
        let ux = u_local[i * 6];
        let uy = u_local[i * 6 + 1];
        eps_xx += dn_dx[i] * ux;
        eps_yy += dn_dy[i] * uy;
        gamma_xy += dn_dy[i] * ux + dn_dx[i] * uy;
    }

    let mut kappa_xx = 0.0;
    let mut kappa_yy = 0.0;
    let mut kappa_xy = 0.0;
    for i in 0..9 {
        let rx = u_local[i * 6 + 3];
        let ry = u_local[i * 6 + 4];
        kappa_xx += -dn_dx[i] * ry;
        kappa_yy += dn_dy[i] * rx;
        kappa_xy += dn_dx[i] * rx - dn_dy[i] * ry;
    }

    let c = e / (1.0 - nu * nu);
    let sigma_xx = c * (eps_xx + nu * eps_yy);
    let sigma_yy = c * (nu * eps_xx + eps_yy);
    let tau_xy = c * (1.0 - nu) / 2.0 * gamma_xy;

    let cb = e * t * t / (12.0 * (1.0 - nu * nu));
    let mx = cb * (kappa_xx + nu * kappa_yy);
    let my = cb * (nu * kappa_xx + kappa_yy);
    let mxy = cb * (1.0 - nu) / 2.0 * kappa_xy;

    let von_mises = (sigma_xx * sigma_xx - sigma_xx * sigma_yy
        + sigma_yy * sigma_yy + 3.0 * tau_xy * tau_xy).sqrt();

    crate::element::quad::QuadStressResult {
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

/// Compute von Mises stress at each of the 9 nodes by evaluating at 3×3 Gauss points
/// and using least-squares projection to nodes.
pub fn quad9_nodal_von_mises(
    coords: &[[f64; 3]; 9],
    u_local: &[f64],
    e: f64,
    nu: f64,
    _t: f64,
) -> Vec<f64> {
    let (ex, ey, _) = quad9_local_axes(coords);
    let pts = project_to_2d_9(coords, &ex, &ey);
    let gauss = gauss_3x3();

    // Evaluate von Mises at each Gauss point
    let mut gp_vm = [0.0; 9];
    for (gp, &((xi, eta), _)) in gauss.iter().enumerate() {
        let (_, inv_j, _) = jacobian_2d_9(&pts, xi, eta);
        let (dn_dxi, dn_deta) = shape_derivatives_9(xi, eta);

        let mut dn_dx = [0.0; 9];
        let mut dn_dy = [0.0; 9];
        for i in 0..9 {
            dn_dx[i] = inv_j[0][0] * dn_dxi[i] + inv_j[0][1] * dn_deta[i];
            dn_dy[i] = inv_j[1][0] * dn_dxi[i] + inv_j[1][1] * dn_deta[i];
        }

        let mut eps_xx = 0.0;
        let mut eps_yy = 0.0;
        let mut gamma_xy = 0.0;
        for i in 0..9 {
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

    // For 9-node element, 3×3 Gauss points are at the same parametric locations
    // as a 9-node Lagrange grid, so we can directly interpolate using shape functions.
    // The 3×3 Gauss point locations match the 9-node pattern, so project to nodes
    // using shape function evaluation at node locations.
    let node_coords_nat: [(f64, f64); 9] = [
        (-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0),
        (0.0, -1.0), (1.0, 0.0), (0.0, 1.0), (-1.0, 0.0),
        (0.0, 0.0),
    ];

    // Extrapolate from GP locations (±√(3/5), 0) to node locations (±1, 0)
    // using tensor-product Lagrange interpolation.
    let g = (3.0_f64 / 5.0).sqrt();
    let mut nodal = vec![0.0; 9];
    for (ni, &(xi_n, eta_n)) in node_coords_nat.iter().enumerate() {
        // Evaluate Lagrange basis at node location using GP locations as grid
        let l_xi = lagrange_1d_3_at(xi_n, &[-g, 0.0, g]);
        let l_eta = lagrange_1d_3_at(eta_n, &[-g, 0.0, g]);
        for gj in 0..3 {
            for gi in 0..3 {
                nodal[ni] += l_xi[gi] * l_eta[gj] * gp_vm[gj * 3 + gi];
            }
        }
        if nodal[ni] < 0.0 { nodal[ni] = 0.0; }
    }
    nodal
}

/// 1D Lagrange basis on 3 arbitrary points.
fn lagrange_1d_3_at(s: f64, pts: &[f64; 3]) -> [f64; 3] {
    [
        (s - pts[1]) * (s - pts[2]) / ((pts[0] - pts[1]) * (pts[0] - pts[2])),
        (s - pts[0]) * (s - pts[2]) / ((pts[1] - pts[0]) * (pts[1] - pts[2])),
        (s - pts[0]) * (s - pts[1]) / ((pts[2] - pts[0]) * (pts[2] - pts[1])),
    ]
}

/// Compute full stress tensor at each of the 9 nodes.
pub fn quad9_stress_at_nodes(
    coords: &[[f64; 3]; 9],
    u_local: &[f64],
    e: f64,
    nu: f64,
    t: f64,
) -> Vec<crate::types::QuadNodalStress> {
    let (ex, ey, _) = quad9_local_axes(coords);
    let pts = project_to_2d_9(coords, &ex, &ey);
    let gauss = gauss_3x3();

    let c = e / (1.0 - nu * nu);
    let cb = e * t * t / (12.0 * (1.0 - nu * nu));

    let mut gp_sxx = [0.0; 9];
    let mut gp_syy = [0.0; 9];
    let mut gp_txy = [0.0; 9];
    let mut gp_mx  = [0.0; 9];
    let mut gp_my  = [0.0; 9];
    let mut gp_mxy = [0.0; 9];

    for (gp, &((xi, eta), _)) in gauss.iter().enumerate() {
        let (_, inv_j, _) = jacobian_2d_9(&pts, xi, eta);
        let (dn_dxi, dn_deta) = shape_derivatives_9(xi, eta);

        let mut dn_dx = [0.0; 9];
        let mut dn_dy = [0.0; 9];
        for i in 0..9 {
            dn_dx[i] = inv_j[0][0] * dn_dxi[i] + inv_j[0][1] * dn_deta[i];
            dn_dy[i] = inv_j[1][0] * dn_dxi[i] + inv_j[1][1] * dn_deta[i];
        }

        let mut eps_xx = 0.0;
        let mut eps_yy = 0.0;
        let mut gamma_xy = 0.0;
        for i in 0..9 {
            let ux = u_local[i * 6];
            let uy = u_local[i * 6 + 1];
            eps_xx += dn_dx[i] * ux;
            eps_yy += dn_dy[i] * uy;
            gamma_xy += dn_dy[i] * ux + dn_dx[i] * uy;
        }

        let mut kappa_xx = 0.0;
        let mut kappa_yy = 0.0;
        let mut kappa_xy = 0.0;
        for i in 0..9 {
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

    // Extrapolate from Gauss points to nodes using Lagrange interpolation
    let g = (3.0_f64 / 5.0).sqrt();
    let node_coords_nat: [(f64, f64); 9] = [
        (-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0),
        (0.0, -1.0), (1.0, 0.0), (0.0, 1.0), (-1.0, 0.0),
        (0.0, 0.0),
    ];

    let mut result = Vec::with_capacity(9);
    for (ni, &(xi_n, eta_n)) in node_coords_nat.iter().enumerate() {
        let l_xi = lagrange_1d_3_at(xi_n, &[-g, 0.0, g]);
        let l_eta = lagrange_1d_3_at(eta_n, &[-g, 0.0, g]);

        let mut sxx = 0.0;
        let mut syy = 0.0;
        let mut txy = 0.0;
        let mut mx  = 0.0;
        let mut my  = 0.0;
        let mut mxy = 0.0;

        for gj in 0..3 {
            for gi in 0..3 {
                let w = l_xi[gi] * l_eta[gj];
                let gp = gj * 3 + gi;
                sxx += w * gp_sxx[gp];
                syy += w * gp_syy[gp];
                txy += w * gp_txy[gp];
                mx  += w * gp_mx[gp];
                my  += w * gp_my[gp];
                mxy += w * gp_mxy[gp];
            }
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

// ==================== Load Vectors ====================

/// Consistent pressure load for quad9 element (54-DOF).
pub fn quad9_pressure_load(coords: &[[f64; 3]; 9], pressure: f64) -> Vec<f64> {
    let (_ex, _ey, ez) = quad9_local_axes(coords);
    let (ex, ey, _) = quad9_local_axes(coords);
    let pts = project_to_2d_9(coords, &ex, &ey);

    let mut f = vec![0.0; 54];
    let gauss = gauss_3x3();

    for &((xi, eta), w_g) in &gauss {
        let (_, _, det_j) = jacobian_2d_9(&pts, xi, eta);
        let n = shape_functions_9(xi, eta);
        let dv = det_j.abs() * w_g;

        for i in 0..9 {
            let f_local_z = pressure * n[i] * dv;
            f[i * 6]     += f_local_z * ez[0];
            f[i * 6 + 1] += f_local_z * ez[1];
            f[i * 6 + 2] += f_local_z * ez[2];
        }
    }

    f
}

/// Thermal load vector for quad9 element (54-DOF).
pub fn quad9_thermal_load(
    coords: &[[f64; 3]; 9],
    e: f64,
    nu: f64,
    t: f64,
    alpha: f64,
    dt_uniform: f64,
    dt_gradient: f64,
) -> Vec<f64> {
    let (ex, ey, _ez) = quad9_local_axes(coords);
    let pts = project_to_2d_9(coords, &ex, &ey);
    let ndof = 54;
    let mut f = vec![0.0; ndof];

    let n_t = e * alpha * dt_uniform * t / (1.0 - nu);
    let m_t = e * alpha * dt_gradient * t * t / (12.0 * (1.0 - nu));

    let gauss = gauss_3x3();

    for &((xi, eta), w_g) in &gauss {
        let (_, inv_j, det_j) = jacobian_2d_9(&pts, xi, eta);
        let (dn_dxi, dn_deta) = shape_derivatives_9(xi, eta);
        let dv = det_j.abs() * w_g;

        let mut dn_dx = [0.0; 9];
        let mut dn_dy = [0.0; 9];
        for i in 0..9 {
            dn_dx[i] = inv_j[0][0] * dn_dxi[i] + inv_j[0][1] * dn_deta[i];
            dn_dy[i] = inv_j[1][0] * dn_dxi[i] + inv_j[1][1] * dn_deta[i];
        }

        for i in 0..9 {
            let di = i * 6;
            f[di]     += dv * dn_dx[i] * n_t;
            f[di + 1] += dv * dn_dy[i] * n_t;
            f[di + 3] += dv * dn_dy[i] * m_t;
            f[di + 4] -= dv * dn_dx[i] * m_t;
        }
    }

    // Transform from local to global
    let t_mat = quad9_transform_3d(coords);
    let mut f_global = vec![0.0; ndof];
    for i in 0..ndof {
        for j in 0..ndof {
            f_global[i] += t_mat[i * ndof + j] * f[j];
        }
    }
    f_global
}

/// Consistent body force (self-weight) load vector for quad9 element (54-DOF).
pub fn quad9_self_weight_load(
    coords: &[[f64; 3]; 9],
    rho: f64,
    t: f64,
    gx: f64,
    gy: f64,
    gz: f64,
) -> Vec<f64> {
    let (ex, ey, ez) = quad9_local_axes(coords);
    let pts = project_to_2d_9(coords, &ex, &ey);

    // Project global gravity into local coordinates
    let g_local_x = gx * ex[0] + gy * ex[1] + gz * ex[2];
    let g_local_y = gx * ey[0] + gy * ey[1] + gz * ey[2];
    let g_local_z = gx * ez[0] + gy * ez[1] + gz * ez[2];

    let mut f = vec![0.0; 54];
    let gauss = gauss_3x3();

    for &((xi, eta), w_g) in &gauss {
        let (_, _, det_j) = jacobian_2d_9(&pts, xi, eta);
        let n = shape_functions_9(xi, eta);
        let dv = det_j.abs() * w_g;

        for i in 0..9 {
            let w = (rho / 1000.0) * t * n[i] * dv;
            f[i * 6]     += w * g_local_x;
            f[i * 6 + 1] += w * g_local_y;
            f[i * 6 + 2] += w * g_local_z;
        }
    }

    f
}

/// Consistent edge load vector for quad9 element (54-DOF).
///
/// `edge`: edge index 0-3 (0=nodes 0→4→1, 1=nodes 1→5→2, 2=nodes 2→6→3, 3=nodes 3→7→0).
/// Each edge has 3 nodes: 2 corners + 1 midside.
/// `qn`: normal pressure on edge (force/length).
/// `qt`: tangential traction along edge (force/length).
pub fn quad9_edge_load(
    coords: &[[f64; 3]; 9],
    edge: usize,
    qn: f64,
    qt: f64,
) -> Vec<f64> {
    let (_ex, _ey, ez) = quad9_local_axes(coords);
    let ndof = 54;
    let mut f = vec![0.0; ndof];

    // Edge node indices (corner, midside, corner)
    let edge_nodes: [(usize, usize, usize); 4] = [
        (0, 4, 1), // bottom
        (1, 5, 2), // right
        (2, 6, 3), // top
        (3, 7, 0), // left
    ];
    let (n_a, n_m, n_b) = edge_nodes[edge.min(3)];

    // Edge tangent (from first corner to last)
    let edge_vec = sub3(&coords[n_b], &coords[n_a]);
    let l_edge = norm3(&edge_vec);
    if l_edge < 1e-15 { return f; }

    let et = [edge_vec[0] / l_edge, edge_vec[1] / l_edge, edge_vec[2] / l_edge];
    let en = cross3(&ez, &et);

    let qx = qn * en[0] + qt * et[0];
    let qy = qn * en[1] + qt * et[1];
    let qz = qn * en[2] + qt * et[2];

    // 3-point Gauss quadrature along edge (mapped to [0, L])
    let g = (3.0_f64 / 5.0).sqrt();
    let gp_1d = [(-g, 5.0 / 9.0), (0.0, 8.0 / 9.0), (g, 5.0 / 9.0)];

    for &(s, w) in &gp_1d {
        // Parametric coordinate along edge: t = (1+s)/2 maps [-1,1] → [0,1]
        let t_param = 0.5 * (1.0 + s);

        // 1D quadratic shape functions on 3-node edge (at t=0, 0.5, 1)
        let phi_a = (1.0 - t_param) * (1.0 - 2.0 * t_param); // at t=0
        let phi_m = 4.0 * t_param * (1.0 - t_param);          // at t=0.5
        let phi_b = t_param * (2.0 * t_param - 1.0);           // at t=1

        let dl = l_edge * 0.5 * w; // Jacobian of [-1,1] → [0,L] is L/2

        f[n_a * 6]     += qx * phi_a * dl;
        f[n_a * 6 + 1] += qy * phi_a * dl;
        f[n_a * 6 + 2] += qz * phi_a * dl;

        f[n_m * 6]     += qx * phi_m * dl;
        f[n_m * 6 + 1] += qy * phi_m * dl;
        f[n_m * 6 + 2] += qz * phi_m * dl;

        f[n_b * 6]     += qx * phi_b * dl;
        f[n_b * 6 + 1] += qy * phi_b * dl;
        f[n_b * 6 + 2] += qz * phi_b * dl;
    }

    f
}

// ==================== Jacobian Check ====================

/// Check Jacobian determinant over all 3×3 Gauss points.
pub fn quad9_check_jacobian(coords: &[[f64; 3]; 9]) -> (f64, f64, bool) {
    let (ex, ey, _) = quad9_local_axes(coords);
    let pts = project_to_2d_9(coords, &ex, &ey);
    let gauss = gauss_3x3();

    let mut min_det = f64::INFINITY;
    let mut max_det = f64::NEG_INFINITY;
    let mut has_negative = false;

    for &((xi, eta), _) in &gauss {
        let (_, _, det_j) = jacobian_2d_9(&pts, xi, eta);
        min_det = min_det.min(det_j);
        max_det = max_det.max(det_j);
        if det_j <= 0.0 {
            has_negative = true;
        }
    }

    (min_det, max_det, has_negative)
}

/// Quad9 element DOFs for 9 nodes.
pub fn quad9_element_dofs(
    dof_map: &std::collections::HashMap<(usize, usize), usize>,
    nodes: &[usize; 9],
) -> Vec<usize> {
    let mut dofs = Vec::with_capacity(54);
    for &node_id in nodes {
        for local in 0..6 {
            if let Some(&d) = dof_map.get(&(node_id, local)) {
                dofs.push(d);
            }
        }
    }
    dofs
}

// ==================== Tests ====================

#[cfg(test)]
mod tests {
    use super::*;

    fn make_unit_square_9() -> [[f64; 3]; 9] {
        [
            [0.0, 0.0, 0.0], // 0: (-1,-1)
            [1.0, 0.0, 0.0], // 1: (+1,-1)
            [1.0, 1.0, 0.0], // 2: (+1,+1)
            [0.0, 1.0, 0.0], // 3: (-1,+1)
            [0.5, 0.0, 0.0], // 4: (0,-1)
            [1.0, 0.5, 0.0], // 5: (+1,0)
            [0.5, 1.0, 0.0], // 6: (0,+1)
            [0.0, 0.5, 0.0], // 7: (-1,0)
            [0.5, 0.5, 0.0], // 8: (0,0)
        ]
    }

    #[test]
    fn test_shape_functions_partition_of_unity() {
        // Shape functions must sum to 1 at any point
        let test_pts = [
            (0.0, 0.0), (0.5, 0.3), (-0.7, 0.8), (1.0, 1.0), (-1.0, -1.0),
            (0.0, -1.0), (1.0, 0.0),
        ];
        for &(xi, eta) in &test_pts {
            let n = shape_functions_9(xi, eta);
            let sum: f64 = n.iter().sum();
            assert!(
                (sum - 1.0).abs() < 1e-14,
                "Partition of unity failed at ({}, {}): sum = {}",
                xi, eta, sum
            );
        }
    }

    #[test]
    fn test_shape_functions_at_nodes() {
        let node_nat = [
            (-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0),
            (0.0, -1.0), (1.0, 0.0), (0.0, 1.0), (-1.0, 0.0),
            (0.0, 0.0),
        ];
        for (k, &(xi, eta)) in node_nat.iter().enumerate() {
            let n = shape_functions_9(xi, eta);
            for i in 0..9 {
                let expected = if i == k { 1.0 } else { 0.0 };
                assert!(
                    (n[i] - expected).abs() < 1e-14,
                    "N{}({},{}) = {}, expected {}",
                    i, xi, eta, n[i], expected
                );
            }
        }
    }

    #[test]
    fn test_stiffness_symmetry() {
        let coords = make_unit_square_9();
        let k = mitc9_local_stiffness(&coords, 200e6, 0.3, 0.01);

        for i in 0..54 {
            for j in 0..54 {
                let diff = (k[i * 54 + j] - k[j * 54 + i]).abs();
                let max_val = k[i * 54 + j].abs().max(k[j * 54 + i].abs()).max(1e-10);
                assert!(
                    diff / max_val < 1e-10,
                    "Stiffness not symmetric at ({},{}): {} vs {}",
                    i, j, k[i * 54 + j], k[j * 54 + i]
                );
            }
        }
    }

    #[test]
    fn test_stiffness_positive_diagonal() {
        let coords = make_unit_square_9();
        let k = mitc9_local_stiffness(&coords, 200e6, 0.3, 0.01);

        for i in 0..54 {
            assert!(
                k[i * 54 + i] >= 0.0,
                "Negative diagonal at DOF {}: {}",
                i, k[i * 54 + i]
            );
        }
    }

    #[test]
    fn test_rigid_body_modes() {
        let coords = make_unit_square_9();
        let k = mitc9_local_stiffness(&coords, 200e6, 0.3, 0.01);

        // Rigid body translation in x
        let mut u_tx = vec![0.0; 54];
        for i in 0..9 { u_tx[i * 6] = 1.0; }
        let f = mat_vec(&k, &u_tx, 54);
        let f_norm: f64 = f.iter().map(|x| x * x).sum::<f64>().sqrt();
        assert!(f_norm < 1e-3, "Translation X should be zero-energy: f_norm={}", f_norm);

        // Translation in y
        let mut u_ty = vec![0.0; 54];
        for i in 0..9 { u_ty[i * 6 + 1] = 1.0; }
        let f = mat_vec(&k, &u_ty, 54);
        let f_norm: f64 = f.iter().map(|x| x * x).sum::<f64>().sqrt();
        assert!(f_norm < 1e-3, "Translation Y should be zero-energy: f_norm={}", f_norm);

        // Translation in z
        let mut u_tz = vec![0.0; 54];
        for i in 0..9 { u_tz[i * 6 + 2] = 1.0; }
        let f = mat_vec(&k, &u_tz, 54);
        let f_norm: f64 = f.iter().map(|x| x * x).sum::<f64>().sqrt();
        assert!(f_norm < 1e-3, "Translation Z should be zero-energy: f_norm={}", f_norm);
    }

    #[test]
    fn test_transform_orthogonal() {
        let coords = make_unit_square_9();
        let t = quad9_transform_3d(&coords);

        for i in 0..54 {
            for j in 0..54 {
                let mut dot = 0.0;
                for k in 0..54 {
                    dot += t[k * 54 + i] * t[k * 54 + j];
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
        let coords = make_unit_square_9();
        let rho = 7850.0;
        let t = 0.01;
        let m = quad9_consistent_mass(&coords, rho, t);

        let expected_mass = rho * t * 1.0;

        let mut total = 0.0;
        for i in 0..9 {
            for j in 0..9 {
                total += m[(i * 6) * 54 + (j * 6)];
            }
        }
        assert!(
            (total - expected_mass).abs() / expected_mass < 0.01,
            "Total mass: got {} expected {}", total, expected_mass
        );
    }

    #[test]
    fn test_pressure_load_total_force() {
        let coords = make_unit_square_9();
        let p = 10.0; // kN/m²
        let f = quad9_pressure_load(&coords, p);

        // Total force should be p * area = 10.0 * 1.0 = 10.0 kN in z-direction
        let mut total_fz = 0.0;
        for i in 0..9 {
            total_fz += f[i * 6 + 2]; // uz component
        }
        assert!(
            (total_fz - 10.0).abs() < 0.01,
            "Total pressure force: got {}, expected 10.0", total_fz
        );
    }

    /// Helper: n×n matrix-vector multiply
    fn mat_vec(k: &[f64], u: &[f64], n: usize) -> Vec<f64> {
        let mut f = vec![0.0; n];
        for i in 0..n {
            for j in 0..n {
                f[i] += k[i * n + j] * u[j];
            }
        }
        f
    }
}
