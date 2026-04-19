/// SHB8-ANS: 8-node solid-shell element with ANS anti-locking.
///
/// 8-node trilinear hex, 3 DOFs/node (translations only), 24 total DOFs.
/// Full 2×2×2 Gauss integration. ANS for thickness strain (ε_ζζ) and
/// transverse shear (ε_ξζ, ε_ηζ) to prevent Poisson thickness locking
/// and transverse shear locking.
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

/// Build standard 6×24 strain-displacement matrix at a point.
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

/// ANS tying point data for thickness strain and transverse shear.
///
/// Thickness strain ε_ζζ: sampled at 4 mid-surface points (corners in ξ,η at ζ=0).
/// Transverse shear ε_ξζ: sampled at 2 mid-edge points along η (A: (0,-1,0), B: (0,+1,0)).
/// Transverse shear ε_ηζ: sampled at 2 mid-edge points along ξ (C: (-1,0,0), D: (+1,0,0)).
struct AnsTyingData {
    /// B-matrix row for ε_ζζ at 4 tying points (each 24 entries)
    b_zz: [[f64; 24]; 4],
    /// B-matrix row for γ_xz at 2 tying points A,B
    b_xz: [[f64; 24]; 2],
    /// B-matrix row for γ_yz at 2 tying points C,D
    b_yz: [[f64; 24]; 2],
}

/// Pre-compute ANS tying data from element coordinates.
fn compute_ans_tying(coords: &[[f64; 3]; 8]) -> AnsTyingData {
    // Thickness strain tying: 4 points at (ξ_i, η_i, 0) for corner ξ,η positions
    let zz_pts = [(-1.0, -1.0, 0.0), (1.0, -1.0, 0.0), (1.0, 1.0, 0.0), (-1.0, 1.0, 0.0)];
    let mut b_zz = [[0.0; 24]; 4];
    for (k, &(xi, eta, zeta)) in zz_pts.iter().enumerate() {
        let dn = shape_derivatives_hex8(xi, eta, zeta);
        let (_, ji, _) = jacobian_3d(coords, &dn);
        let dn_dx = physical_derivatives(&ji, &dn);
        // ε_ζζ row = row 2 of B-matrix: ∂w/∂z
        for i in 0..8 {
            b_zz[k][i * 3 + 2] = dn_dx[2][i];
        }
    }

    // Transverse shear ε_ξζ (γ_xz): tying at A=(0,-1,0), B=(0,+1,0)
    // These are mid-edges in η direction (constant ξ edges)
    let xz_pts = [(0.0, -1.0, 0.0), (0.0, 1.0, 0.0)];
    let mut b_xz = [[0.0; 24]; 2];
    for (k, &(xi, eta, zeta)) in xz_pts.iter().enumerate() {
        let dn = shape_derivatives_hex8(xi, eta, zeta);
        let (_, ji, _) = jacobian_3d(coords, &dn);
        let dn_dx = physical_derivatives(&ji, &dn);
        // γ_xz row: ∂u/∂z + ∂w/∂x
        for i in 0..8 {
            b_xz[k][i * 3]     = dn_dx[2][i]; // ∂u/∂z
            b_xz[k][i * 3 + 2] = dn_dx[0][i]; // ∂w/∂x
        }
    }

    // Transverse shear ε_ηζ (γ_yz): tying at C=(-1,0,0), D=(+1,0,0)
    let yz_pts = [(-1.0, 0.0, 0.0), (1.0, 0.0, 0.0)];
    let mut b_yz = [[0.0; 24]; 2];
    for (k, &(xi, eta, zeta)) in yz_pts.iter().enumerate() {
        let dn = shape_derivatives_hex8(xi, eta, zeta);
        let (_, ji, _) = jacobian_3d(coords, &dn);
        let dn_dx = physical_derivatives(&ji, &dn);
        // γ_yz row: ∂v/∂z + ∂w/∂y
        for i in 0..8 {
            b_yz[k][i * 3 + 1] = dn_dx[2][i]; // ∂v/∂z
            b_yz[k][i * 3 + 2] = dn_dx[1][i]; // ∂w/∂y
        }
    }

    AnsTyingData { b_zz, b_xz, b_yz }
}

/// Replace ε_ζζ, γ_xz, γ_yz rows of B with ANS-interpolated values.
fn apply_ans(b: &mut [f64; 144], xi: f64, eta: f64, tying: &AnsTyingData) {
    // Bilinear interpolation weights for ε_ζζ from 4 corner tying points
    let w_zz = [
        0.25 * (1.0 - xi) * (1.0 - eta),
        0.25 * (1.0 + xi) * (1.0 - eta),
        0.25 * (1.0 + xi) * (1.0 + eta),
        0.25 * (1.0 - xi) * (1.0 + eta),
    ];

    // Replace row 2 (ε_ζζ)
    for col in 0..24 {
        b[2 * 24 + col] = w_zz[0] * tying.b_zz[0][col]
                         + w_zz[1] * tying.b_zz[1][col]
                         + w_zz[2] * tying.b_zz[2][col]
                         + w_zz[3] * tying.b_zz[3][col];
    }

    // Linear interpolation for γ_xz from 2 tying points A(η=-1), B(η=+1)
    let wa = 0.5 * (1.0 - eta);
    let wb = 0.5 * (1.0 + eta);
    for col in 0..24 {
        b[5 * 24 + col] = wa * tying.b_xz[0][col] + wb * tying.b_xz[1][col];
    }

    // Linear interpolation for γ_yz from 2 tying points C(ξ=-1), D(ξ=+1)
    let wc = 0.5 * (1.0 - xi);
    let wd = 0.5 * (1.0 + xi);
    for col in 0..24 {
        b[4 * 24 + col] = wc * tying.b_yz[0][col] + wd * tying.b_yz[1][col];
    }
}

// ==================== Stiffness Matrix ====================

/// 24×24 solid-shell stiffness matrix with ANS.
/// coords: 8 nodes × [x,y,z], E in kN/m², ν dimensionless.
/// Returns 576 entries in row-major order.
pub fn solid_shell_stiffness(coords: &[[f64; 3]; 8], e: f64, nu: f64) -> Vec<f64> {
    let ndof = 24;
    let mut k = vec![0.0; ndof * ndof];
    let c = material_matrix_3d(e, nu);
    let tying = compute_ans_tying(coords);
    let gauss = gauss_2x2x2();

    for &(xi, eta, zeta, w) in &gauss {
        let dn = shape_derivatives_hex8(xi, eta, zeta);
        let (_, ji, det_j) = jacobian_3d(coords, &dn);
        let dn_dx = physical_derivatives(&ji, &dn);
        let mut b = build_b_matrix(&dn_dx);
        apply_ans(&mut b, xi, eta, &tying);
        let dv = det_j.abs() * w;

        // K += B^T · C · B · dV
        // Compute CB = C · B (6×24)
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

        // K += B^T · CB · dV
        for i in 0..24 {
            for j in i..24 {
                let mut s = 0.0;
                for p in 0..6 {
                    s += b[p * 24 + i] * cb[p * 24 + j];
                }
                let val = s * dv;
                k[i * ndof + j] += val;
                if i != j {
                    k[j * ndof + i] += val;
                }
            }
        }
    }

    // Symmetrize (ANS can introduce slight asymmetry)
    for i in 0..ndof {
        for j in (i + 1)..ndof {
            let avg = 0.5 * (k[i * ndof + j] + k[j * ndof + i]);
            k[i * ndof + j] = avg;
            k[j * ndof + i] = avg;
        }
    }

    k
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

/// Compute mid-surface stresses by evaluating at ζ=0 centroid.
/// Returns in-plane stresses mapped to QuadStressResult for compatibility.
/// u: 24-element displacement vector in global coordinates.
pub fn solid_shell_stresses(
    coords: &[[f64; 3]; 8],
    u: &[f64],
    e: f64,
    nu: f64,
) -> QuadStressResult {
    let c = material_matrix_3d(e, nu);

    // Evaluate at centroid (0, 0, 0)
    let dn = shape_derivatives_hex8(0.0, 0.0, 0.0);
    let (_, ji, _) = jacobian_3d(coords, &dn);
    let dn_dx = physical_derivatives(&ji, &dn);
    let b = build_b_matrix(&dn_dx);

    // ε = B · u
    let mut strain = [0.0; 6];
    for i in 0..6 {
        for j in 0..24 {
            strain[i] += b[i * 24 + j] * u[j];
        }
    }

    // σ = C · ε
    let mut stress = [0.0; 6];
    for i in 0..6 {
        for j in 0..6 {
            stress[i] += c[i * 6 + j] * strain[j];
        }
    }

    let sigma_xx = stress[0];
    let sigma_yy = stress[1];
    let tau_xy = stress[3];
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

/// Average stress tensor at element centroid (for geometric stiffness).
pub fn solid_shell_avg_stress(
    coords: &[[f64; 3]; 8],
    u: &[f64],
    e: f64,
    nu: f64,
) -> [f64; 6] {
    let c = material_matrix_3d(e, nu);
    let dn = shape_derivatives_hex8(0.0, 0.0, 0.0);
    let (_, ji, _) = jacobian_3d(coords, &dn);
    let dn_dx = physical_derivatives(&ji, &dn);
    let b = build_b_matrix(&dn_dx);

    let mut strain = [0.0; 6];
    for i in 0..6 {
        for j in 0..24 {
            strain[i] += b[i * 24 + j] * u[j];
        }
    }

    let mut stress = [0.0; 6];
    for i in 0..6 {
        for j in 0..6 {
            stress[i] += c[i * 6 + j] * strain[j];
        }
    }
    stress
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
    let gauss = gauss_2x2x2();
    let mut vm = Vec::with_capacity(8);

    for &(xi, eta, zeta, _) in &gauss {
        let dn = shape_derivatives_hex8(xi, eta, zeta);
        let (_, ji, _) = jacobian_3d(coords, &dn);
        let dn_dx = physical_derivatives(&ji, &dn);
        let b = build_b_matrix(&dn_dx);

        let mut strain = [0.0; 6];
        for i in 0..6 {
            for j in 0..24 {
                strain[i] += b[i * 24 + j] * u[j];
            }
        }

        let mut stress = [0.0; 6];
        for i in 0..6 {
            for j in 0..6 {
                stress[i] += c[i * 6 + j] * strain[j];
            }
        }

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
