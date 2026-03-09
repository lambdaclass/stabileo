/// Unified frame element stiffness matrix.
/// Works for both 2D (6×6, dofs_per_node=3) and 3D (12×12, dofs_per_node=6).
/// 2D frame local stiffness matrix (6×6).
/// DOFs: [u1, v1, θ1, u2, v2, θ2]
/// E in kN/m², A in m², Iz in m⁴, L in m.
/// phi: Timoshenko shear parameter = 12*E*Iz / (G*As*L²). Pass 0.0 for Euler-Bernoulli.
pub fn frame_local_stiffness_2d(
    e: f64,
    a: f64,
    iz: f64,
    l: f64,
    hinge_start: bool,
    hinge_end: bool,
    phi: f64,
) -> Vec<f64> {
    let mut k = vec![0.0; 36]; // 6×6

    let ea_l = e * a / l;
    let ei = e * iz;
    let l2 = l * l;
    let l3 = l2 * l;

    if hinge_start && hinge_end {
        // Both hinges: only axial stiffness
        k[0 * 6 + 0] = ea_l;
        k[0 * 6 + 3] = -ea_l;
        k[3 * 6 + 0] = -ea_l;
        k[3 * 6 + 3] = ea_l;
        return k;
    }

    // Axial terms
    k[0 * 6 + 0] = ea_l;
    k[0 * 6 + 3] = -ea_l;
    k[3 * 6 + 0] = -ea_l;
    k[3 * 6 + 3] = ea_l;

    if !hinge_start && !hinge_end {
        // No hinges: Timoshenko beam (reduces to Euler-Bernoulli when phi=0)
        // Ref: Przemieniecki, "Theory of Matrix Structural Analysis", Ch. 4
        let denom = 1.0 + phi;
        let c1 = 12.0 * ei / (l3 * denom);
        let c2 = 6.0 * ei / (l2 * denom);
        let c3 = (4.0 + phi) * ei / (l * denom);
        let c4 = (2.0 - phi) * ei / (l * denom);

        k[1 * 6 + 1] = c1;
        k[1 * 6 + 2] = c2;
        k[1 * 6 + 4] = -c1;
        k[1 * 6 + 5] = c2;

        k[2 * 6 + 1] = c2;
        k[2 * 6 + 2] = c3;
        k[2 * 6 + 4] = -c2;
        k[2 * 6 + 5] = c4;

        k[4 * 6 + 1] = -c1;
        k[4 * 6 + 2] = -c2;
        k[4 * 6 + 4] = c1;
        k[4 * 6 + 5] = -c2;

        k[5 * 6 + 1] = c2;
        k[5 * 6 + 2] = c4;
        k[5 * 6 + 4] = -c2;
        k[5 * 6 + 5] = c3;
    } else if hinge_start {
        // Hinge at start (M1 = 0): condensed from full Timoshenko
        // Condensing θ1 from 4×4 bending block gives coefficient 12/(4+phi)
        // For phi=0: 12/4 = 3, recovering Euler-Bernoulli result
        let factor = 12.0 / (4.0 + phi);
        let c1 = factor * ei / l3;
        let c2 = factor * ei / l2;
        let c3 = factor * ei / l;

        k[1 * 6 + 1] = c1;
        k[1 * 6 + 4] = -c1;
        k[1 * 6 + 5] = c2;

        k[4 * 6 + 1] = -c1;
        k[4 * 6 + 4] = c1;
        k[4 * 6 + 5] = -c2;

        k[5 * 6 + 1] = c2;
        k[5 * 6 + 4] = -c2;
        k[5 * 6 + 5] = c3;
    } else {
        // Hinge at end (M2 = 0): condensed from full Timoshenko
        let factor = 12.0 / (4.0 + phi);
        let c1 = factor * ei / l3;
        let c2 = factor * ei / l2;
        let c3 = factor * ei / l;

        k[1 * 6 + 1] = c1;
        k[1 * 6 + 2] = c2;
        k[1 * 6 + 4] = -c1;

        k[2 * 6 + 1] = c2;
        k[2 * 6 + 2] = c3;
        k[2 * 6 + 4] = -c2;

        k[4 * 6 + 1] = -c1;
        k[4 * 6 + 2] = -c2;
        k[4 * 6 + 4] = c1;
    }

    k
}

/// 3D frame local stiffness matrix (12×12).
/// DOFs: [u1, v1, w1, θx1, θy1, θz1, u2, v2, w2, θx2, θy2, θz2]
/// E in kN/m², A in m², Iy in m⁴, Iz in m⁴, J in m⁴, L in m.
/// G = E / (2*(1+nu)), typically nu=0.3 → G = E/2.6
/// phi_y, phi_z: Timoshenko shear parameters for each bending plane.
///   phi_y = 12*E*Iy / (G*As_y*L²), phi_z = 12*E*Iz / (G*As_z*L²). Pass 0.0 for Euler-Bernoulli.
pub fn frame_local_stiffness_3d(
    e: f64,
    a: f64,
    iy: f64,
    iz: f64,
    j: f64,
    l: f64,
    g: f64,
    hinge_start: bool,
    hinge_end: bool,
    phi_y: f64,
    phi_z: f64,
) -> Vec<f64> {
    let mut k = vec![0.0; 144]; // 12×12
    let n = 12;

    let ea_l = e * a / l;
    let gj_l = g * j / l;
    let l2 = l * l;
    let l3 = l2 * l;

    if hinge_start && hinge_end {
        // Both hinges: axial + torsion only
        k[0 * n + 0] = ea_l;
        k[0 * n + 6] = -ea_l;
        k[6 * n + 0] = -ea_l;
        k[6 * n + 6] = ea_l;
        k[3 * n + 3] = gj_l;
        k[3 * n + 9] = -gj_l;
        k[9 * n + 3] = -gj_l;
        k[9 * n + 9] = gj_l;
        return k;
    }

    // Axial
    k[0 * n + 0] = ea_l;
    k[0 * n + 6] = -ea_l;
    k[6 * n + 0] = -ea_l;
    k[6 * n + 6] = ea_l;

    // Torsion
    k[3 * n + 3] = gj_l;
    k[3 * n + 9] = -gj_l;
    k[9 * n + 3] = -gj_l;
    k[9 * n + 9] = gj_l;

    if !hinge_start && !hinge_end {
        // Bending in Y-Z plane (strong axis, Iz) — Timoshenko with phi_z
        let denom_z = 1.0 + phi_z;
        let c1z = 12.0 * e * iz / (l3 * denom_z);
        let c2z = 6.0 * e * iz / (l2 * denom_z);
        let c3z = (4.0 + phi_z) * e * iz / (l * denom_z);
        let c4z = (2.0 - phi_z) * e * iz / (l * denom_z);

        k[1 * n + 1] = c1z;
        k[1 * n + 5] = c2z;
        k[1 * n + 7] = -c1z;
        k[1 * n + 11] = c2z;

        k[5 * n + 1] = c2z;
        k[5 * n + 5] = c3z;
        k[5 * n + 7] = -c2z;
        k[5 * n + 11] = c4z;

        k[7 * n + 1] = -c1z;
        k[7 * n + 5] = -c2z;
        k[7 * n + 7] = c1z;
        k[7 * n + 11] = -c2z;

        k[11 * n + 1] = c2z;
        k[11 * n + 5] = c4z;
        k[11 * n + 7] = -c2z;
        k[11 * n + 11] = c3z;

        // Bending in X-Z plane (weak axis, Iy) — Timoshenko with phi_y
        let denom_y = 1.0 + phi_y;
        let c1y = 12.0 * e * iy / (l3 * denom_y);
        let c2y = 6.0 * e * iy / (l2 * denom_y);
        let c3y = (4.0 + phi_y) * e * iy / (l * denom_y);
        let c4y = (2.0 - phi_y) * e * iy / (l * denom_y);

        k[2 * n + 2] = c1y;
        k[2 * n + 4] = -c2y;
        k[2 * n + 8] = -c1y;
        k[2 * n + 10] = -c2y;

        k[4 * n + 2] = -c2y;
        k[4 * n + 4] = c3y;
        k[4 * n + 8] = c2y;
        k[4 * n + 10] = c4y;

        k[8 * n + 2] = -c1y;
        k[8 * n + 4] = c2y;
        k[8 * n + 8] = c1y;
        k[8 * n + 10] = c2y;

        k[10 * n + 2] = -c2y;
        k[10 * n + 4] = c4y;
        k[10 * n + 8] = c2y;
        k[10 * n + 10] = c3y;
    } else if hinge_start {
        // Hinge at start: condensed Timoshenko, factor = 12/(4+phi)
        let fz = 12.0 / (4.0 + phi_z);
        let c1z = fz * e * iz / l3;
        let c2z = fz * e * iz / l2;
        let c3z = fz * e * iz / l;

        k[1 * n + 1] = c1z;
        k[1 * n + 7] = -c1z;
        k[1 * n + 11] = c2z;
        k[7 * n + 1] = -c1z;
        k[7 * n + 7] = c1z;
        k[7 * n + 11] = -c2z;
        k[11 * n + 1] = c2z;
        k[11 * n + 7] = -c2z;
        k[11 * n + 11] = c3z;

        let fy = 12.0 / (4.0 + phi_y);
        let c1y = fy * e * iy / l3;
        let c2y = fy * e * iy / l2;
        let c3y = fy * e * iy / l;

        k[2 * n + 2] = c1y;
        k[2 * n + 8] = -c1y;
        k[2 * n + 10] = -c2y;
        k[8 * n + 2] = -c1y;
        k[8 * n + 8] = c1y;
        k[8 * n + 10] = c2y;
        k[10 * n + 2] = -c2y;
        k[10 * n + 8] = c2y;
        k[10 * n + 10] = c3y;
    } else {
        // Hinge at end: condensed Timoshenko
        let fz = 12.0 / (4.0 + phi_z);
        let c1z = fz * e * iz / l3;
        let c2z = fz * e * iz / l2;
        let c3z = fz * e * iz / l;

        k[1 * n + 1] = c1z;
        k[1 * n + 5] = c2z;
        k[1 * n + 7] = -c1z;
        k[5 * n + 1] = c2z;
        k[5 * n + 5] = c3z;
        k[5 * n + 7] = -c2z;
        k[7 * n + 1] = -c1z;
        k[7 * n + 5] = -c2z;
        k[7 * n + 7] = c1z;

        let fy = 12.0 / (4.0 + phi_y);
        let c1y = fy * e * iy / l3;
        let c2y = fy * e * iy / l2;
        let c3y = fy * e * iy / l;

        k[2 * n + 2] = c1y;
        k[2 * n + 4] = -c2y;
        k[2 * n + 8] = -c1y;
        k[4 * n + 2] = -c2y;
        k[4 * n + 4] = c3y;
        k[4 * n + 8] = c2y;
        k[8 * n + 2] = -c1y;
        k[8 * n + 4] = c2y;
        k[8 * n + 8] = c1y;
    }

    k
}

/// 3D frame local stiffness matrix with warping DOF (14×14).
/// DOFs: [u1, v1, w1, θx1, θy1, θz1, φ'1, u2, v2, w2, θx2, θy2, θz2, φ'2]
/// cw: warping constant (m⁶), phi' = rate of twist (warping DOF)
pub fn frame_local_stiffness_3d_warping(
    e: f64, a: f64, iy: f64, iz: f64, j: f64, cw: f64, l: f64, g: f64,
    hinge_start: bool, hinge_end: bool,
    phi_y: f64, phi_z: f64,
) -> Vec<f64> {
    let n = 14;
    let mut k = vec![0.0; n * n];

    // Start with standard 12x12 embedded in 14x14
    let k12 = frame_local_stiffness_3d(e, a, iy, iz, j, l, g, hinge_start, hinge_end, phi_y, phi_z);

    // Map 12x12 DOFs to 14x14: 0-5 → 0-5, 6-11 → 7-12
    let map12to14 = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];
    for i in 0..12 {
        for jj in 0..12 {
            k[map12to14[i] * n + map12to14[jj]] = k12[i * 12 + jj];
        }
    }

    // Add warping torsion coupling (DOFs 3,6 for node I and 10,13 for node J)
    // Warping stiffness submatrix using Hermitian cubic interpolation:
    //   Torsion DOFs: theta_x at DOFs 3 (node I) and 10 (node J)
    //   Warping DOFs: phi' at DOFs 6 (node I) and 13 (node J)
    let l2 = l * l;
    let l3 = l2 * l;
    let ecw = e * cw;
    let gj = g * j;

    // Replace torsion block with coupled torsion-warping block
    // 4x4 submatrix at DOFs [3, 6, 10, 13]
    let idx = [3, 6, 10, 13];

    // Clear existing torsion terms (DOFs 3, 10)
    k[3 * n + 3] = 0.0;
    k[3 * n + 10] = 0.0;
    k[10 * n + 3] = 0.0;
    k[10 * n + 10] = 0.0;

    // Torsion-warping 4x4: [θx1, φ'1, θx2, φ'2]
    let tw = [
        gj / l + 12.0 * ecw / l3,    6.0 * ecw / l2,     -gj / l - 12.0 * ecw / l3,    6.0 * ecw / l2,
        6.0 * ecw / l2,               4.0 * ecw / l,      -6.0 * ecw / l2,               2.0 * ecw / l,
        -gj / l - 12.0 * ecw / l3,   -6.0 * ecw / l2,     gj / l + 12.0 * ecw / l3,    -6.0 * ecw / l2,
        6.0 * ecw / l2,               2.0 * ecw / l,      -6.0 * ecw / l2,               4.0 * ecw / l,
    ];

    for i in 0..4 {
        for jj in 0..4 {
            k[idx[i] * n + idx[jj]] = tw[i * 4 + jj];
        }
    }

    k
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_frame_2d_symmetry() {
        let k = frame_local_stiffness_2d(200e6, 0.01, 1e-4, 3.0, false, false, 0.0);
        for i in 0..6 {
            for j in 0..6 {
                assert!(
                    (k[i * 6 + j] - k[j * 6 + i]).abs() < 1e-6,
                    "K not symmetric at ({},{}): {} vs {}",
                    i, j, k[i * 6 + j], k[j * 6 + i]
                );
            }
        }
    }

    #[test]
    fn test_frame_2d_both_hinges() {
        let k = frame_local_stiffness_2d(200e6, 0.01, 1e-4, 3.0, true, true, 0.0);
        // Only axial terms should be nonzero
        let ea_l = 200e6 * 0.01 / 3.0;
        assert!((k[0 * 6 + 0] - ea_l).abs() < 1e-6);
        assert!((k[3 * 6 + 3] - ea_l).abs() < 1e-6);
        // All bending terms should be zero
        assert!(k[1 * 6 + 1].abs() < 1e-10);
        assert!(k[2 * 6 + 2].abs() < 1e-10);
    }

    #[test]
    fn test_frame_3d_symmetry() {
        let k = frame_local_stiffness_3d(
            200e6, 0.01, 1e-4, 2e-4, 5e-5, 3.0,
            200e6 / 2.6, false, false, 0.0, 0.0,
        );
        for i in 0..12 {
            for j in 0..12 {
                assert!(
                    (k[i * 12 + j] - k[j * 12 + i]).abs() < 1e-3,
                    "K3D not symmetric at ({},{}): {} vs {}",
                    i, j, k[i * 12 + j], k[j * 12 + i]
                );
            }
        }
    }
}
