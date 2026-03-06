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
