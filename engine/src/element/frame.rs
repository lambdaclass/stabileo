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
    frame_local_stiffness_2d_typed(
        Modulus::from_kn_per_m2(e), Area::from_m2(a), SecondMoment::from_m4(iz),
        Length::from_m(l), hinge_start, hinge_end, phi,
    )
}

use crate::types::units::{Modulus, Area, SecondMoment, Length};

/// Typed 2D elastic kernel. Unit erasure occurs only at mixed-DOF matrix entries.
pub fn frame_local_stiffness_2d_typed(
    e: Modulus, a: Area, iz: SecondMoment, l: Length,
    hinge_start: bool, hinge_end: bool, phi: f64,
) -> Vec<f64> {
    let mut k = vec![0.0; 36]; // 6×6

    let ea_l = (e * a / l).in_kn_per_m();
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
        let c1 = (12.0 * ei / (l3 * denom)).in_kn_per_m();
        let c2 = (6.0 * ei / (l2 * denom)).in_kn();
        let c3 = ((4.0 + phi) * ei / (l * denom)).in_kn_m();
        let c4 = ((2.0 - phi) * ei / (l * denom)).in_kn_m();

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
        let c1 = (factor * ei / l3).in_kn_per_m();
        let c2 = (factor * ei / l2).in_kn();
        let c3 = (factor * ei / l).in_kn_m();

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
        let c1 = (factor * ei / l3).in_kn_per_m();
        let c2 = (factor * ei / l2).in_kn();
        let c3 = (factor * ei / l).in_kn_m();

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

/// Timoshenko shear parameter of a 2D member, φ = 12·E·Iz/(G·As_y·L²) with
/// G = E/(2(1+ν)); 0 (Euler–Bernoulli) without a shear area. `e` in kN/m².
/// Shared by the linear force recovery and the fiber force correction so both
/// subtract the same elastic stiffness.
pub(crate) fn timoshenko_phi_2d(sec: &crate::types::SolverSection, e: f64, nu: f64, l: f64) -> f64 {
    match sec.as_y {
        Some(as_y) => {
            let g = e / (2.0 * (1.0 + nu));
            12.0 * e * sec.iz / (g * as_y * l * l)
        }
        None => 0.0,
    }
}

/// Timoshenko shear parameters (φy, φz) of a 3D member: φy = 12·E·Iy/(G·as_y·L²)
/// pairs `as_y` with `iy`, φz = 12·E·Iz/(G·as_z·L²); 0 without the shear area.
pub(crate) fn timoshenko_phi_3d(sec: &crate::types::SolverSection3D, e: f64, g: f64, l: f64) -> (f64, f64) {
    let l2 = l * l;
    (
        sec.as_y.map(|ay| 12.0 * e * sec.iy / (g * ay * l2)).unwrap_or(0.0),
        sec.as_z.map(|az| 12.0 * e * sec.iz / (g * az * l2)).unwrap_or(0.0),
    )
}

/// Per-axis release flags for a 3D frame element.
/// A "hinge" in 3D releases ONE rotation (around the pin axis), not all of them.
/// Each flag governs an independent local rotation/torsion DOF.
#[derive(Debug, Clone, Copy, Default)]
pub struct Hinge3D {
    /// Release rotation about local y axis (Iy bending block) at node I.
    pub release_my_start: bool,
    /// Release rotation about local z axis (Iz bending block) at node I.
    pub release_mz_start: bool,
    /// Release torsion about local x axis at node I.
    pub release_t_start: bool,
    /// Release rotation about local y axis (Iy bending block) at node J.
    pub release_my_end: bool,
    /// Release rotation about local z axis (Iz bending block) at node J.
    pub release_mz_end: bool,
    /// Release torsion about local x axis at node J.
    pub release_t_end: bool,
}

impl Hinge3D {
    /// Build from a `SolverElement3D` reference.
    pub fn from_elem(elem: &crate::types::SolverElement3D) -> Self {
        Self {
            release_my_start: elem.release_my_start,
            release_mz_start: elem.release_mz_start,
            release_t_start: elem.release_t_start,
            release_my_end: elem.release_my_end,
            release_mz_end: elem.release_mz_end,
            release_t_end: elem.release_t_end,
        }
    }
}

/// Add a 4-DOF Timoshenko bending block (v1, r1, v2, r2) into a 12x12 matrix
/// at the given DOF indices. `s` is the sign of the off-diagonal c2 coefficient
/// (+1 for Z-plane bending, -1 for Y-plane bending — captures the right-hand-rule
/// sign mismatch between the two planes).
pub(crate) fn add_bending_block(
    k: &mut [f64], n: usize,
    v1: usize, r1: usize, v2: usize, r2: usize,
    e: f64, i: f64, l: f64, l2: f64, l3: f64, phi: f64,
    s: f64,
    release_start: bool,
    release_end: bool,
) {
    if release_start && release_end {
        // Both rotations released: bending block contributes nothing.
        return;
    }
    if !release_start && !release_end {
        // Full Timoshenko 4×4
        let denom = 1.0 + phi;
        let c1 = 12.0 * e * i / (l3 * denom);
        let c2 = 6.0 * e * i / (l2 * denom);
        let c3 = (4.0 + phi) * e * i / (l * denom);
        let c4 = (2.0 - phi) * e * i / (l * denom);
        k[v1 * n + v1] = c1;     k[v1 * n + r1] = s * c2;   k[v1 * n + v2] = -c1;     k[v1 * n + r2] = s * c2;
        k[r1 * n + v1] = s * c2; k[r1 * n + r1] = c3;       k[r1 * n + v2] = -s * c2; k[r1 * n + r2] = c4;
        k[v2 * n + v1] = -c1;    k[v2 * n + r1] = -s * c2;  k[v2 * n + v2] = c1;      k[v2 * n + r2] = -s * c2;
        k[r2 * n + v1] = s * c2; k[r2 * n + r1] = c4;       k[r2 * n + v2] = -s * c2; k[r2 * n + r2] = c3;
        return;
    }
    // Single end released — condensed 3×3 block, factor = 12/(4+phi)
    let f = 12.0 / (4.0 + phi);
    let c1 = f * e * i / l3;
    let c2 = f * e * i / l2;
    let c3 = f * e * i / l;
    if release_start {
        // Condense rotation at node I (r1 row/col stays zero)
        k[v1 * n + v1] = c1;     k[v1 * n + v2] = -c1;     k[v1 * n + r2] = s * c2;
        k[v2 * n + v1] = -c1;    k[v2 * n + v2] = c1;      k[v2 * n + r2] = -s * c2;
        k[r2 * n + v1] = s * c2; k[r2 * n + v2] = -s * c2; k[r2 * n + r2] = c3;
    } else {
        // Condense rotation at node J (r2 row/col stays zero)
        k[v1 * n + v1] = c1;     k[v1 * n + r1] = s * c2;  k[v1 * n + v2] = -c1;
        k[r1 * n + v1] = s * c2; k[r1 * n + r1] = c3;      k[r1 * n + v2] = -s * c2;
        k[v2 * n + v1] = -c1;    k[v2 * n + r1] = -s * c2; k[v2 * n + v2] = c1;
    }
}

/// 3D frame local stiffness matrix (12×12).
/// DOFs: [u1, v1, w1, θx1, θy1, θz1, u2, v2, w2, θx2, θy2, θz2]
/// E in kN/m², A in m², Iy in m⁴, Iz in m⁴, J in m⁴, L in m.
/// G = E / (2*(1+nu)), typically nu=0.3 → G = E/2.6
/// phi_y, phi_z: Timoshenko shear parameters for each bending plane.
///   phi_y = 12*E*Iy / (G*As_y*L²), phi_z = 12*E*Iz / (G*As_z*L²). Pass 0.0 for Euler-Bernoulli.
///
/// `hinge` carries six per-axis release flags. Each rotation/torsion DOF is
/// condensed independently. The two bending blocks (Iy plane and Iz plane) and
/// the torsion block do not couple — releasing rotation about local y leaves
/// rotation about local z fully stiff, and vice versa. Releasing torsion at
/// either end zeroes the entire torsion block (no twist transmission).
pub fn frame_local_stiffness_3d(
    e: f64,
    a: f64,
    iy: f64,
    iz: f64,
    j: f64,
    l: f64,
    g: f64,
    hinge: Hinge3D,
    phi_y: f64,
    phi_z: f64,
) -> Vec<f64> {
    let mut k = vec![0.0; 144];
    let n = 12;
    let l2 = l * l;
    let l3 = l2 * l;

    // Axial — never released
    let ea_l = e * a / l;
    k[0 * n + 0] = ea_l;
    k[0 * n + 6] = -ea_l;
    k[6 * n + 0] = -ea_l;
    k[6 * n + 6] = ea_l;

    // Torsion — released entirely if either end is released (single-DOF
    // condensation collapses to zero stiffness for the remaining DOF).
    if !hinge.release_t_start && !hinge.release_t_end {
        let gj_l = g * j / l;
        k[3 * n + 3] = gj_l;
        k[3 * n + 9] = -gj_l;
        k[9 * n + 3] = -gj_l;
        k[9 * n + 9] = gj_l;
    }

    // Bending in Z-plane (Iz, sign +1): translations uy=DOFs 1,7; rotations θz=DOFs 5,11
    add_bending_block(
        &mut k, n, 1, 5, 7, 11, e, iz, l, l2, l3, phi_z, 1.0,
        hinge.release_mz_start, hinge.release_mz_end,
    );

    // Bending in Y-plane (Iy, sign -1): translations uz=DOFs 2,8; rotations θy=DOFs 4,10
    add_bending_block(
        &mut k, n, 2, 4, 8, 10, e, iy, l, l2, l3, phi_y, -1.0,
        hinge.release_my_start, hinge.release_my_end,
    );

    k
}

/// Torsion-warping 4×4 block over [θx1, φ'1, θx2, φ'2] (row-major).
///
/// The twist θx is the cubic Hermite interpolant of the four DOFs and the
/// block is its strain energy ½∫(G·J·θx'² + E·Cw·θx''²) dx: the St-Venant part
/// G·J/(30L)·[36, 3L, −36, 3L; 3L, 4L², −3L, −L²; …] plus the warping part
/// E·Cw/L³·[12, 6L, −12, 6L; …] (Barsoum & Gallagher 1970; McGuire, Gallagher
/// & Ziemian, Matrix Structural Analysis, 2nd ed., §8.4). The St-Venant part
/// used to be G·J/L on the twist DOFs alone, the energy of a linear twist
/// beside the cubic one of the warping part: still convergent, but as h²
/// instead of h⁴ (10% off for one element of a cantilever with kL ≈ 2.4).
pub(crate) fn torsion_warping_block(gj: f64, ecw: f64, l: f64, l2: f64, l3: f64) -> [f64; 16] {
    // Each distinct term computed once: symmetric entries are the same f64 value
    // by construction. (−x − y and −(x + y) round identically.)
    let t = 6.0 * gj / (5.0 * l) + 12.0 * ecw / l3;
    let b = gj / 10.0 + 6.0 * ecw / l2;
    let c = 2.0 * gj * l / 15.0 + 4.0 * ecw / l;
    let d = 2.0 * ecw / l - gj * l / 30.0;
    [
         t,  b, -t,  b,
         b,  c, -b,  d,
        -t, -b,  t, -b,
         b,  d, -b,  c,
    ]
}

/// 3D frame local stiffness matrix with warping DOF (14×14).
/// DOFs: [u1, v1, w1, θx1, θy1, θz1, φ'1, u2, v2, w2, θx2, θy2, θz2, φ'2]
/// cw: warping constant (m⁶), phi' = rate of twist (warping DOF)
pub fn frame_local_stiffness_3d_warping(
    e: f64, a: f64, iy: f64, iz: f64, j: f64, cw: f64, l: f64, g: f64,
    hinge: Hinge3D,
    phi_y: f64, phi_z: f64,
) -> Vec<f64> {
    let n = 14;
    let mut k = vec![0.0; n * n];

    // Start with standard 12x12 embedded in 14x14
    let k12 = frame_local_stiffness_3d(e, a, iy, iz, j, l, g, hinge, phi_y, phi_z);

    // Map 12x12 DOFs to 14x14: 0-5 → 0-5, 6-11 → 7-12
    let map12to14 = [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12];
    for i in 0..12 {
        for jj in 0..12 {
            k[map12to14[i] * n + map12to14[jj]] = k12[i * 12 + jj];
        }
    }

    // Add warping torsion coupling (DOFs 3,6 for node I and 10,13 for node J)
    // Torsion-warping submatrix of the cubic Hermite twist (torsion_warping_block):
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

    // Torsion release at either end kills all twist transmission, including
    // warping torsion. Without this guard the warping block below would
    // silently overwrite the release applied by frame_local_stiffness_3d.
    if !hinge.release_t_start && !hinge.release_t_end {
        let tw = torsion_warping_block(gj, ecw, l, l2, l3);

        for i in 0..4 {
            for jj in 0..4 {
                k[idx[i] * n + idx[jj]] = tw[i * 4 + jj];
            }
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
            200e6 / 2.6, Hinge3D::default(), 0.0, 0.0,
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
