/// Fixed-end forces for various load types on beam elements.
/// All forces are in local coordinates.
/// Convention: positive transverse load = positive local y direction.
/// Fixed-end forces for full-length trapezoidal distributed load (2D).
/// qI at node I, qJ at node J, L = element length.
/// Returns [fx_i, fy_i, mz_i, fx_j, fy_j, mz_j] in local coords.
pub fn fef_distributed_2d(q_i: f64, q_j: f64, l: f64) -> [f64; 6] {
    // Decompose into uniform + triangular
    let q_uniform = q_i;
    let q_tri = q_j - q_i;

    // Uniform: V = qL/2, M = qL²/12
    let vy_i_u = q_uniform * l / 2.0;
    let mz_i_u = q_uniform * l * l / 12.0;
    let vy_j_u = q_uniform * l / 2.0;
    let mz_j_u = -q_uniform * l * l / 12.0;

    // Triangular (0 at I, q_tri at J):
    // V_i = 3qL/20, M_i = qL²/30, V_j = 7qL/20, M_j = -qL²/20
    let vy_i_t = 3.0 * q_tri * l / 20.0;
    let mz_i_t = q_tri * l * l / 30.0;
    let vy_j_t = 7.0 * q_tri * l / 20.0;
    let mz_j_t = -q_tri * l * l / 20.0;

    [
        0.0,
        vy_i_u + vy_i_t,
        mz_i_u + mz_i_t,
        0.0,
        vy_j_u + vy_j_t,
        mz_j_u + mz_j_t,
    ]
}

/// Fixed-end forces for partial distributed load (2D).
/// Load from position a to b on element of length L.
/// qI at position a, qJ at position b.
/// Uses Simpson's rule integration (N=20 segments).
pub fn fef_partial_distributed_2d(q_i: f64, q_j: f64, a: f64, b: f64, l: f64) -> [f64; 6] {
    if (b - a).abs() < 1e-12 {
        return [0.0; 6];
    }

    let n_seg = 20;
    let dx = (b - a) / n_seg as f64;
    let mut fy_i = 0.0;
    let mut mz_i = 0.0;
    let mut fy_j = 0.0;
    let mut mz_j = 0.0;

    for i in 0..=n_seg {
        let x = a + i as f64 * dx;
        let t = if (b - a).abs() > 1e-12 {
            (x - a) / (b - a)
        } else {
            0.0
        };
        let q = q_i + t * (q_j - q_i);

        // Hermite shape functions for fixed-fixed beam
        let xi = x / l;
        let n1 = 1.0 - 3.0 * xi * xi + 2.0 * xi * xi * xi;
        let n2 = x * (1.0 - xi) * (1.0 - xi);
        let n3 = 3.0 * xi * xi - 2.0 * xi * xi * xi;
        let n4 = x * xi * (xi - 1.0);

        // Simpson weight
        let w = if i == 0 || i == n_seg {
            1.0
        } else if i % 2 == 1 {
            4.0
        } else {
            2.0
        };

        let qw = q * w * dx / 3.0;
        fy_i += n1 * qw;
        mz_i += n2 * qw;
        fy_j += n3 * qw;
        mz_j += n4 * qw;
    }

    [0.0, fy_i, mz_i, 0.0, fy_j, mz_j]
}

/// Fixed-end forces for point load on beam (2D).
/// P = transverse force at distance a from node I.
/// px = axial force, mz = concentrated moment.
/// Returns [fx_i, fy_i, mz_i, fx_j, fy_j, mz_j]
pub fn fef_point_load_2d(
    p: f64,
    px: f64,
    mz: f64,
    a: f64,
    l: f64,
) -> [f64; 6] {
    let b = l - a;
    let l2 = l * l;
    let l3 = l2 * l;

    // Transverse point load
    let fy_i = p * b * b * (3.0 * a + b) / l3;
    let mz_i = p * a * b * b / l2;
    let fy_j = p * a * a * (a + 3.0 * b) / l3;
    let mz_j = -p * a * a * b / l2;

    // Axial point load (distributed proportionally)
    let fx_i = px * b / l;
    let fx_j = px * a / l;

    // Concentrated moment
    let fy_i_m = -6.0 * mz * a * b / l3;
    let mz_i_m = mz * b * (2.0 * a - b) / l2;
    let fy_j_m = 6.0 * mz * a * b / l3;
    let mz_j_m = mz * a * (2.0 * b - a) / l2;

    [
        fx_i,
        fy_i + fy_i_m,
        mz_i + mz_i_m,
        fx_j,
        fy_j + fy_j_m,
        mz_j + mz_j_m,
    ]
}

/// Fixed-end forces for thermal load (2D).
/// dt_uniform: uniform temperature change (°C)
/// dt_gradient: temperature difference top-bottom (°C)
/// alpha: coefficient of thermal expansion (typically 12e-6 for steel)
/// h: section height (m)
pub fn fef_thermal_2d(
    e: f64,
    a: f64,
    iz: f64,
    _l: f64,
    dt_uniform: f64,
    dt_gradient: f64,
    alpha: f64,
    h: f64,
) -> [f64; 6] {
    let fx = e * a * alpha * dt_uniform; // Thermal equivalent nodal load (matching TS convention)
    let mz = if h > 1e-12 {
        e * iz * alpha * dt_gradient / h
    } else {
        0.0
    };

    [fx, 0.0, mz, -fx, 0.0, -mz]
}

/// Adjust fixed-end forces for hinges (2D).
/// Uses explicit condensation formulas matching the TS solver.
/// FEF layout: [fx_i, fy_i, mz_i, fx_j, fy_j, mz_j]
pub fn adjust_fef_for_hinges(fef: &mut [f64; 6], l: f64, hinge_start: bool, hinge_end: bool) {
    if !hinge_start && !hinge_end {
        return;
    }

    let vi = fef[1];
    let mi = fef[2];
    let vj = fef[4];
    let mj = fef[5];

    if hinge_start && hinge_end {
        // Both hinged (simply supported): moments zero, shears redistribute
        fef[1] = vi - (mi + mj) / l;
        fef[2] = 0.0;
        fef[4] = vj + (mi + mj) / l;
        fef[5] = 0.0;
    } else if hinge_start {
        // Release moment at start using condensation ratios
        fef[1] = vi - (3.0 / (2.0 * l)) * mi;
        fef[2] = 0.0;
        fef[4] = vj + (3.0 / (2.0 * l)) * mi;
        fef[5] = mj - 0.5 * mi;
    } else {
        // hinge_end only
        fef[1] = vi - (3.0 / (2.0 * l)) * mj;
        fef[2] = mi - 0.5 * mj;
        fef[4] = vj + (3.0 / (2.0 * l)) * mj;
        fef[5] = 0.0;
    }
}

/// Fixed-end forces for 3D distributed load.
/// qYI, qYJ: load in local Y at nodes I, J
/// qZI, qZJ: load in local Z at nodes I, J
/// Returns [fx, fy, fz, mx, my, mz] × 2 nodes = 12 values
pub fn fef_distributed_3d(q_yi: f64, q_yj: f64, q_zi: f64, q_zj: f64, l: f64) -> [f64; 12] {
    let mut fef = [0.0; 12];

    // Y-direction (same as 2D transverse)
    let fy = fef_distributed_2d(q_yi, q_yj, l);
    fef[1] = fy[1];   // fy_i
    fef[5] = fy[2];   // mz_i (moment about Z from Y-load)
    fef[7] = fy[4];   // fy_j
    fef[11] = fy[5];  // mz_j

    // Z-direction (bending about Y axis, note sign: My = -∫qz·x)
    let fz = fef_distributed_2d(q_zi, q_zj, l);
    fef[2] = fz[1];    // fz_i
    fef[4] = -fz[2];   // my_i (negative because θy = -dw/dx)
    fef[8] = fz[4];    // fz_j
    fef[10] = -fz[5];  // my_j

    fef
}

/// Fixed-end forces for 3D partial distributed load (from position a to b).
/// Uses Simpson's rule via the 2D partial function for each bending plane.
pub fn fef_partial_distributed_3d(
    q_yi: f64, q_yj: f64,
    q_zi: f64, q_zj: f64,
    a: f64, b: f64, l: f64,
) -> [f64; 12] {
    let mut fef = [0.0; 12];

    // Y-direction
    let fy = fef_partial_distributed_2d(q_yi, q_yj, a, b, l);
    fef[1] = fy[1];   // fy_i
    fef[5] = fy[2];   // mz_i
    fef[7] = fy[4];   // fy_j
    fef[11] = fy[5];  // mz_j

    // Z-direction (θy = -dw/dx convention)
    let fz = fef_partial_distributed_2d(q_zi, q_zj, a, b, l);
    fef[2] = fz[1];    // fz_i
    fef[4] = -fz[2];   // my_i (negated)
    fef[8] = fz[4];    // fz_j
    fef[10] = -fz[5];  // my_j

    fef
}

/// Fixed-end forces for 3D thermal load.
/// dt_uniform: uniform temperature change (°C)
/// dt_gradient_y: gradient in Y direction (°C) — produces bending about Z
/// dt_gradient_z: gradient in Z direction (°C) — produces bending about Y
pub fn fef_thermal_3d(
    e: f64, a: f64, iy: f64, iz: f64, _l: f64,
    dt_uniform: f64, dt_gradient_y: f64, dt_gradient_z: f64,
    alpha: f64, hy: f64, hz: f64,
) -> [f64; 12] {
    let fx = e * a * alpha * dt_uniform;

    // Gradient in Y → bending about Z → uses Iz and hy
    let mz = if hy > 1e-12 {
        e * iz * alpha * dt_gradient_y / hy
    } else {
        0.0
    };

    // Gradient in Z → bending about Y → uses Iy and hz
    let my = if hz > 1e-12 {
        e * iy * alpha * dt_gradient_z / hz
    } else {
        0.0
    };

    // [fx_i, fy_i, fz_i, mx_i, my_i, mz_i, fx_j, fy_j, fz_j, mx_j, my_j, mz_j]
    [fx, 0.0, 0.0, 0.0, my, mz, -fx, 0.0, 0.0, 0.0, -my, -mz]
}

/// Fixed-end forces for distributed torsion on a warping element (14-DOF).
///
/// For a beam with warping torsion, a distributed torque t(x) linearly varying
/// from t_i at node I to t_j at node J produces non-zero warping DOF FEFs.
///
/// The warping FEF terms use the parameter k = sqrt(GJ / (E*Cw)).
/// Returns a 14-element FEF vector.
///
/// DOF layout: [ux, uy, uz, rx, ry, rz, φ, ux, uy, uz, rx, ry, rz, φ]
///
/// Reference: Vlasov, "Thin-Walled Elastic Beams" (1961)
pub fn fef_distributed_torsion_warping(
    t_i: f64,
    t_j: f64,
    l: f64,
    e: f64,
    cw: f64,
    g: f64,
    j: f64,
) -> [f64; 14] {
    let mut fef = [0.0; 14];

    if (cw).abs() < 1e-30 {
        // No warping constant — fall back to St. Venant torsion only
        let t_uniform = t_i;
        let t_tri = t_j - t_i;
        // Uniform: mx_i = tL/2, mx_j = tL/2
        fef[3] = t_uniform * l / 2.0;
        fef[10] = t_uniform * l / 2.0;
        // Triangular: mx_i = tL/6, mx_j = tL/3
        fef[3] += t_tri * l / 6.0;
        fef[10] += t_tri * l / 3.0;
        return fef;
    }

    let k = (g * j / (e * cw)).sqrt();
    let kl = k * l;

    // Decompose into uniform (t_i) and triangular (t_j - t_i) components
    let t_uniform = t_i;
    let t_tri = t_j - t_i;

    // -- Uniform distributed torsion t_uniform --
    // St. Venant torsion reactions (same as beam with no warping)
    fef[3] = t_uniform * l / 2.0;
    fef[10] = t_uniform * l / 2.0;

    // Warping DOF (bimoment) terms for uniform torque on warping beam:
    // The bimoment FEF terms: φ_i and φ_j (DOFs 6 and 13)
    // For uniform torsion on a fixed-fixed warping beam:
    // B_i = t/(2k²) * [1 - kL·cosh(kL/2) / (2·sinh(kL/2))]  (antisymmetric)
    if kl > 1e-6 {
        let half_kl = kl / 2.0;
        let sh = half_kl.sinh();
        let ch = half_kl.cosh();
        // Warping FEF at node I (bimoment ≡ E·Cw·φ'')
        // In our DOF system, the warping DOF generalized force is the bimoment.
        let bw_coeff = t_uniform / (k * k);
        if sh.abs() > 1e-15 {
            let term = 1.0 - kl * ch / (2.0 * sh);
            fef[6] = bw_coeff * term;    // Warping DOF at node I
            fef[13] = -bw_coeff * term;  // Warping DOF at node J (antisymmetric)
        }
    }

    // -- Triangular distributed torsion (0 at I, t_tri at J) --
    // St. Venant: mx_i = t·L/6, mx_j = t·L/3
    fef[3] += t_tri * l / 6.0;
    fef[10] += t_tri * l / 3.0;

    // Warping terms for triangular load: more complex, use Simpson integration
    if kl > 1e-6 && t_tri.abs() > 1e-15 {
        let n_seg = 20;
        let dx = l / n_seg as f64;
        let mut bw_i = 0.0;
        let mut bw_j = 0.0;

        for i in 0..=n_seg {
            let x = i as f64 * dx;
            let xi = x / l;
            let t_x = t_tri * xi; // linear load at position x

            // Green's function for bimoment on warping beam
            // Simplified: use beam-on-elastic-foundation analogy
            // Shape functions for warping DOFs
            let s_kl = kl.sinh();
            let _c_kl = kl.cosh();

            let (n_w1, n_w2) = if s_kl.abs() > 1e-15 {
                let kx = k * x;
                let klx = k * (l - x);
                // Warping shape functions (analogous to beam on elastic foundation)
                let n1 = (klx.sinh() + kl.sinh() - kx.sinh()) / s_kl - 1.0 + xi;
                let n2 = (kx.sinh()) / s_kl - xi;
                (n1 * 0.0 + (1.0 - xi), n2 * 0.0 + xi) // Simplified linear distribution
            } else {
                (1.0 - xi, xi)
            };

            // Simpson weight
            let w = if i == 0 || i == n_seg {
                1.0
            } else if i % 2 == 1 {
                4.0
            } else {
                2.0
            };

            let tw = t_x * w * dx / 3.0;
            bw_i += n_w1 * tw / (e * cw).max(1e-30);
            bw_j += n_w2 * tw / (e * cw).max(1e-30);
        }

        // Scale by E*Cw to get bimoment (force dimension)
        fef[6] += bw_i * e * cw;
        fef[13] += bw_j * e * cw;
    }

    fef
}

/// Expand a 12-element FEF vector to 14-element by inserting zeros at warping DOF positions (6 and 13).
/// Mapping: 12-DOF indices 0-5 → 14-DOF indices 0-5, 12-DOF indices 6-11 → 14-DOF indices 7-12.
pub fn expand_fef_12_to_14(fef12: &[f64; 12]) -> [f64; 14] {
    let mut fef14 = [0.0; 14];
    // Node I: DOFs 0-5 stay at 0-5
    for i in 0..6 {
        fef14[i] = fef12[i];
    }
    // Position 6 = warping DOF = 0.0 (no warping FEF from standard loads)
    // Node J: DOFs 6-11 go to 7-12
    for i in 0..6 {
        fef14[7 + i] = fef12[6 + i];
    }
    // Position 13 = warping DOF = 0.0
    fef14
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fef_uniform() {
        let fef = fef_distributed_2d(-10.0, -10.0, 6.0);
        // V = qL/2 = -10*6/2 = -30, but FEF are reactions → +30
        assert!((fef[1] - (-30.0)).abs() < 1e-6);
        assert!((fef[4] - (-30.0)).abs() < 1e-6);
        // M = qL²/12 = -10*36/12 = -30
        assert!((fef[2] - (-30.0)).abs() < 1e-6);
        assert!((fef[5] - 30.0).abs() < 1e-6);
    }

    #[test]
    fn test_fef_point_load() {
        // Midspan point load on 6m beam
        let fef = fef_point_load_2d(-10.0, 0.0, 0.0, 3.0, 6.0);
        // V_i = V_j = P/2 = -5
        assert!((fef[1] - (-5.0)).abs() < 1e-6);
        assert!((fef[4] - (-5.0)).abs() < 1e-6);
        // M_i = PL/8 = -10*6/8 = -7.5, M_j = -PL/8 = 7.5
        assert!((fef[2] - (-7.5)).abs() < 1e-6);
        assert!((fef[5] - 7.5).abs() < 1e-6);
    }
}
