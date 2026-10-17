/// Fixed-end forces for various load types on beam elements.
/// All forces are in local coordinates.
/// Convention: positive transverse load = positive local y direction.

// ==================== Timoshenko-consistent fixed-end forces ====================
//
// A member with shear flexibility (section `asY`/`asZ`) has the shear
// parameter φ = 12·E·I / (G·As·L²) in its stiffness matrix. Its fixed-end
// forces must be those of the same (Timoshenko) beam, otherwise the assembled
// system mixes a shear-flexible K with Euler–Bernoulli loads.
//
// By reciprocity, the fixed-end force at end DOF k is the work of the member
// load on the exact deflected shape of the unloaded member under a unit
// displacement of DOF k with the other three fixed. For a Timoshenko beam that
// shape is the "interdependent interpolation" (Reddy 1997; Friedman–Kosmatka
// 1993), with μ = 1/(1+φ) and ξ = x/L:
//
//   N1 = μ(1 − 3ξ² + 2ξ³ + φ(1−ξ))         ψ1 = μ·6(ξ² − ξ)/L
//   N2 = μL(ξ − 2ξ² + ξ³ + φ(ξ−ξ²)/2)       ψ2 = μ(1 − 4ξ + 3ξ² + φ(1−ξ))
//   N3 = μ(3ξ² − 2ξ³ + φξ)                  ψ3 = μ·6(ξ − ξ²)/L
//   N4 = μL(−ξ² + ξ³ − φ(ξ−ξ²)/2)           ψ4 = μ(−2ξ + 3ξ² + φξ)
//
// (N = transverse deflection v, ψ = section rotation, the rotational DOF.)
// A transverse force loads by N, a concentrated couple by ψ. For φ = 0 these
// are the cubic Hermite functions and ψ = N'. Integrated against a load, the
// φ terms give the closed form (tools/opensees/README.md)
//   V' = (V + φ·R)/(1+φ),   M_i' = (M_i + φ/2·(M_i − M_j))/(1+φ),
//   M_j' = (M_j − φ/2·(M_i − M_j))/(1+φ),
// with R the simply supported reactions; uniform full-length loads are
// unchanged (M_i = −M_j, R = V). The unit tests check all of this against an
// independent force-method solution of the shear-flexible fixed beam.

/// Transverse-deflection shape functions `[N1, N2, N3, N4]` of the exact
/// two-node Timoshenko element at `x ∈ [0, L]` (cubic Hermite for φ = 0).
#[inline]
pub fn timoshenko_deflection_shapes(x: f64, l: f64, phi: f64) -> [f64; 4] {
    let xi = x / l;
    let xi2 = xi * xi;
    let xi3 = xi2 * xi;
    let mu = 1.0 / (1.0 + phi);
    let s = xi - xi2;
    [
        mu * (1.0 - 3.0 * xi2 + 2.0 * xi3 + phi * (1.0 - xi)),
        mu * l * (xi - 2.0 * xi2 + xi3 + 0.5 * phi * s),
        mu * (3.0 * xi2 - 2.0 * xi3 + phi * xi),
        mu * l * (-xi2 + xi3 - 0.5 * phi * s),
    ]
}

/// Section-rotation shape functions `[ψ1, ψ2, ψ3, ψ4]` of the exact two-node
/// Timoshenko element (the slopes of the Hermite functions for φ = 0).
#[inline]
pub fn timoshenko_rotation_shapes(x: f64, l: f64, phi: f64) -> [f64; 4] {
    let xi = x / l;
    let xi2 = xi * xi;
    let mu = 1.0 / (1.0 + phi);
    [
        mu * 6.0 * (xi2 - xi) / l,
        mu * (1.0 - 4.0 * xi + 3.0 * xi2 + phi * (1.0 - xi)),
        mu * 6.0 * (xi - xi2) / l,
        mu * (-2.0 * xi + 3.0 * xi2 + phi * xi),
    ]
}

/// Shear-flexibility correction of transverse fixed-end forces
/// `[V_i, M_i, V_j, M_j]` computed for φ = 0 from transverse *forces*
/// (not couples). Exact: it is the integral of the φ terms of the Timoshenko
/// shape functions.
#[inline]
fn shear_correct(v_i: f64, m_i: f64, v_j: f64, m_j: f64, l: f64, phi: f64) -> [f64; 4] {
    if phi == 0.0 {
        return [v_i, m_i, v_j, m_j];
    }
    let mu = 1.0 / (1.0 + phi);
    let r_i = v_i - (m_i + m_j) / l;
    let r_j = v_j + (m_i + m_j) / l;
    let dm = 0.5 * phi * (m_i - m_j);
    [mu * (v_i + phi * r_i), mu * (m_i + dm), mu * (v_j + phi * r_j), mu * (m_j - dm)]
}

/// Fixed-end forces for full-length trapezoidal distributed load (2D).
/// qI at node I, qJ at node J, L = element length, `phi` the Timoshenko
/// shear parameter of the bending plane (0 for Euler–Bernoulli).
/// Returns [fx_i, fy_i, mz_i, fx_j, fy_j, mz_j] in local coords.
pub fn fef_distributed_2d(q_i: f64, q_j: f64, l: f64, phi: f64) -> [f64; 6] {
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

    let [fy_i, mz_i, fy_j, mz_j] = shear_correct(
        vy_i_u + vy_i_t,
        mz_i_u + mz_i_t,
        vy_j_u + vy_j_t,
        mz_j_u + mz_j_t,
        l,
        phi,
    );
    [0.0, fy_i, mz_i, 0.0, fy_j, mz_j]
}

/// Fixed-end forces for partial distributed load (2D).
/// Load from position a to b on element of length L.
/// qI at position a, qJ at position b; `phi` the Timoshenko shear parameter.
///
/// The integrand (a linear load times the Timoshenko shape functions, cubic
/// polynomials) is a degree-4 polynomial on [a, b], so 3-point Gauss-Legendre
/// (exact through degree 5) gives the consistent nodal loads exactly.
/// (Composite Simpson with 20 panels, used before, is exact only through
/// degree 3 and left a ~1e-6 relative error, found by differential testing
/// against OpenSees.)
pub fn fef_partial_distributed_2d(q_i: f64, q_j: f64, a: f64, b: f64, l: f64, phi: f64) -> [f64; 6] {
    if (b - a).abs() < 1e-12 {
        return [0.0; 6];
    }

    let half = 0.5 * (b - a);
    let mid = 0.5 * (a + b);
    let g = (0.6f64).sqrt();
    let mut f = [0.0; 4];

    for (t, w) in [(-g, 5.0 / 9.0), (0.0, 8.0 / 9.0), (g, 5.0 / 9.0)] {
        let x = mid + half * t;
        let q = q_i + (t + 1.0) * 0.5 * (q_j - q_i);
        let n = timoshenko_deflection_shapes(x, l, phi);
        let qw = q * w * half;
        for k in 0..4 {
            f[k] += n[k] * qw;
        }
    }

    [0.0, f[0], f[1], 0.0, f[2], f[3]]
}

/// Fixed-end forces for point load on beam (2D).
/// P = transverse force at distance a from node I.
/// px = axial force, mz = concentrated moment; `phi` the Timoshenko shear
/// parameter (0 for Euler–Bernoulli).
/// Returns [fx_i, fy_i, mz_i, fx_j, fy_j, mz_j]
pub fn fef_point_load_2d(
    p: f64,
    px: f64,
    mz: f64,
    a: f64,
    l: f64,
    phi: f64,
) -> [f64; 6] {
    let b = l - a;

    // Transverse point load: P·N(a). For φ = 0:
    // [P b²(3a+b)/L³, P a b²/L², P a²(a+3b)/L³, −P a² b/L²].
    let n = timoshenko_deflection_shapes(a, l, phi);

    // Axial point load (distributed proportionally)
    let fx_i = px * b / l;
    let fx_j = px * a / l;

    // Concentrated moment (counter-clockwise positive), as equivalent nodal
    // loads: the couple does work on the section rotation ψ(a), so it loads
    // by the rotation shape functions, M·ψ(a) (= M·N'(a) for φ = 0). The two
    // moment terms used to carry the textbook fixed-end REACTION moments,
    // +M·b(2a−b)/L² and +M·a(2b−a)/L² — the negatives of these — while the
    // shear terms were already equivalent loads. The mix broke statics: the
    // vector summed to a moment of 1.88 M about node i instead of M, and a
    // cantilever carrying a 6 kN·m couple reported −11.28 at its wall.
    let psi = timoshenko_rotation_shapes(a, l, phi);

    [
        fx_i,
        p * n[0] + mz * psi[0],
        p * n[1] + mz * psi[1],
        fx_j,
        p * n[2] + mz * psi[2],
        p * n[3] + mz * psi[3],
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
    let fx = e * a * alpha * dt_uniform;
    let mz = if h > 1e-12 {
        e * iz * alpha * dt_gradient / h
    } else {
        0.0
    };

    // Thermal expansion: element wants to grow → equivalent nodal loads push outward
    // Node I gets -fx (pushed in -x), Node J gets +fx (pushed in +x)
    // Matches 3D convention. Note: TS solver has the opposite sign (known divergence).
    [-fx, 0.0, -mz, fx, 0.0, mz]
}

/// Adjust fixed-end forces for hinges (2D).
/// Static condensation of FEF for hinges (2D), with Timoshenko correction.
///
/// Condensation ratios from K[V,θ]/K[θ,θ] = 6/(L(4+φ)) and
/// K[θ_j,θ_i]/K[θ_i,θ_i] = (2-φ)/(4+φ). For φ=0 these reduce to
/// 3/(2L) and 0.5 (Euler-Bernoulli). Both-hinges case is φ-independent.
///
/// FEF layout: [fx_i, fy_i, mz_i, fx_j, fy_j, mz_j]
pub fn adjust_fef_for_hinges(fef: &mut [f64; 6], l: f64, hinge_start: bool, hinge_end: bool, phi: f64) {
    if !hinge_start && !hinge_end {
        return;
    }

    let vi = fef[1];
    let mi = fef[2];
    let vj = fef[4];
    let mj = fef[5];

    if hinge_start && hinge_end {
        // Both hinged (simply supported): φ cancels out
        fef[1] = vi - (mi + mj) / l;
        fef[2] = 0.0;
        fef[4] = vj + (mi + mj) / l;
        fef[5] = 0.0;
    } else if hinge_start {
        let sv = 6.0 / (l * (4.0 + phi));
        let sm = (2.0 - phi) / (4.0 + phi);
        fef[1] = vi - sv * mi;
        fef[2] = 0.0;
        fef[4] = vj + sv * mi;
        fef[5] = mj - sm * mi;
    } else {
        // hinge_end only
        let sv = 6.0 / (l * (4.0 + phi));
        let sm = (2.0 - phi) / (4.0 + phi);
        fef[1] = vi - sv * mj;
        fef[2] = mi - sm * mj;
        fef[4] = vj + sv * mj;
        fef[5] = 0.0;
    }
}

/// Static condensation of FEF for hinges (3D), with Timoshenko correction.
///
/// Each bending plane uses its own φ:
///   - Y-bending (Vy, Mz): phi_z = 12EIz/(G·As_z·L²)
///   - Z-bending (Vz, My): phi_y = 12EIy/(G·As_y·L²)
///
/// FEF layout: [fx_i, fy_i, fz_i, mx_i, my_i, mz_i, fx_j, fy_j, fz_j, mx_j, my_j, mz_j]
pub fn adjust_fef_for_hinges_3d(
    fef: &mut [f64; 12],
    l: f64,
    hinge: super::frame::Hinge3D,
    phi_y: f64,
    phi_z: f64,
) {
    // --- Y-bending plane (shear-y / moment-z) — controlled by release_mz_* ---
    let mz_start = hinge.release_mz_start;
    let mz_end = hinge.release_mz_end;
    if mz_start || mz_end {
        let vy_i = fef[1];
        let mz_i = fef[5];
        let vy_j = fef[7];
        let mz_j = fef[11];

        if mz_start && mz_end {
            fef[1] = vy_i - (mz_i + mz_j) / l;
            fef[5] = 0.0;
            fef[7] = vy_j + (mz_i + mz_j) / l;
            fef[11] = 0.0;
        } else if mz_start {
            let sv = 6.0 / (l * (4.0 + phi_z));
            let sm = (2.0 - phi_z) / (4.0 + phi_z);
            fef[1] = vy_i - sv * mz_i;
            fef[5] = 0.0;
            fef[7] = vy_j + sv * mz_i;
            fef[11] = mz_j - sm * mz_i;
        } else {
            let sv = 6.0 / (l * (4.0 + phi_z));
            let sm = (2.0 - phi_z) / (4.0 + phi_z);
            fef[1] = vy_i - sv * mz_j;
            fef[5] = mz_i - sm * mz_j;
            fef[7] = vy_j + sv * mz_j;
            fef[11] = 0.0;
        }
    }

    // --- Z-bending plane (shear-z / moment-y) — controlled by release_my_* ---
    // Due to θy = -dw/dx, K[Vz,θy] = -6EI/(L²(1+φ)), so shear
    // redistribution signs are opposite to the Y-bending plane.
    let my_start = hinge.release_my_start;
    let my_end = hinge.release_my_end;
    if my_start || my_end {
        let vz_i = fef[2];
        let my_i = fef[4];
        let vz_j = fef[8];
        let my_j = fef[10];

        if my_start && my_end {
            fef[2] = vz_i + (my_i + my_j) / l;
            fef[4] = 0.0;
            fef[8] = vz_j - (my_i + my_j) / l;
            fef[10] = 0.0;
        } else if my_start {
            let sv = 6.0 / (l * (4.0 + phi_y));
            let sm = (2.0 - phi_y) / (4.0 + phi_y);
            fef[2] = vz_i + sv * my_i;
            fef[4] = 0.0;
            fef[8] = vz_j - sv * my_i;
            fef[10] = my_j - sm * my_i;
        } else {
            let sv = 6.0 / (l * (4.0 + phi_y));
            let sm = (2.0 - phi_y) / (4.0 + phi_y);
            fef[2] = vz_i + sv * my_j;
            fef[4] = my_i - sm * my_j;
            fef[8] = vz_j - sv * my_j;
            fef[10] = 0.0;
        }
    }
}

/// Place the 2D fixed-end forces of the two bending planes into a 12-vector.
/// `fy`: load along local y (bends about z, moments → θz);
/// `fz`: load along local z (bends about y; θy = −dw/dx, so moments flip).
fn place_bending_planes_3d(fy: &[f64; 6], fz: &[f64; 6]) -> [f64; 12] {
    let mut fef = [0.0; 12];
    fef[1] = fy[1];   // fy_i
    fef[5] = fy[2];   // mz_i
    fef[7] = fy[4];   // fy_j
    fef[11] = fy[5];  // mz_j
    fef[2] = fz[1];    // fz_i
    fef[4] = -fz[2];   // my_i (negative because θy = -dw/dx)
    fef[8] = fz[4];    // fz_j
    fef[10] = -fz[5];  // my_j
    fef
}

/// Fixed-end forces for 3D distributed load.
/// qYI, qYJ: load in local Y at nodes I, J
/// qZI, qZJ: load in local Z at nodes I, J
/// `phi_y` = 12EIy/(G·As_y·L²) governs the local-z load (bending about y);
/// `phi_z` = 12EIz/(G·As_z·L²) the local-y load (bending about z) — the
/// pairing of `frame_local_stiffness_3d`.
/// Returns [fx, fy, fz, mx, my, mz] × 2 nodes = 12 values (axial left zero)
pub fn fef_distributed_3d(
    q_yi: f64, q_yj: f64, q_zi: f64, q_zj: f64, l: f64, phi_y: f64, phi_z: f64,
) -> [f64; 12] {
    place_bending_planes_3d(
        &fef_distributed_2d(q_yi, q_yj, l, phi_z),
        &fef_distributed_2d(q_zi, q_zj, l, phi_y),
    )
}

/// Fixed-end forces for 3D partial distributed load (from position a to b).
/// Uses the (exact) 2D partial function for each bending plane; φ pairing as
/// in [`fef_distributed_3d`].
pub fn fef_partial_distributed_3d(
    q_yi: f64, q_yj: f64,
    q_zi: f64, q_zj: f64,
    a: f64, b: f64, l: f64,
    phi_y: f64, phi_z: f64,
) -> [f64; 12] {
    place_bending_planes_3d(
        &fef_partial_distributed_2d(q_yi, q_yj, a, b, l, phi_z),
        &fef_partial_distributed_2d(q_zi, q_zj, a, b, l, phi_y),
    )
}

/// Fixed-end forces for a 3D transverse point load (py along local y, pz
/// along local z) at distance a from node I; φ pairing as in
/// [`fef_distributed_3d`].
pub fn fef_point_load_3d(py: f64, pz: f64, a: f64, l: f64, phi_y: f64, phi_z: f64) -> [f64; 12] {
    place_bending_planes_3d(
        &fef_point_load_2d(py, 0.0, 0.0, a, l, phi_z),
        &fef_point_load_2d(pz, 0.0, 0.0, a, l, phi_y),
    )
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

    // Thermal expansion: element wants to grow → equivalent nodal loads push outward
    // Node I gets -fx (pushed in -x), Node J gets +fx (pushed in +x)
    // [fx_i, fy_i, fz_i, mx_i, my_i, mz_i, fx_j, fy_j, fz_j, mx_j, my_j, mz_j]
    //
    // Sign convention: 2D thermal FEF is [-fx, 0, -mz, fx, 0, +mz]. For a 3D beam
    // along X in the X-Z plane, 2D mz corresponds directly to 3D my (no sign flip,
    // unlike distributed loads where θy = -dw/dx introduces a flip). So the
    // thermal gradient_z FEF is [-my, +my], matching the physical expectation that
    // a hotter +Z face produces compression at +Z (positive my) in a fixed-fixed beam.
    [-fx, 0.0, 0.0, 0.0, -my, -mz, fx, 0.0, 0.0, 0.0, my, mz]
}

/// Equivalent nodal loads of a distributed torque on a warping element (14-DOF).
///
/// The torque t(x) varies linearly from `t_i` at node I to `t_j` at node J.
/// The loads are the work of t on the element's own twist shapes, the cubic
/// Hermite functions of [θx1, φ'1, θx2, φ'2] that `torsion_warping_block`
/// interpolates with:
///   Mx_i = L(7t_i + 3t_j)/20,   B_i = L²(3t_i + 2t_j)/60,
///   Mx_j = L(3t_i + 7t_j)/20,   B_j = −L²(2t_i + 3t_j)/60.
/// (Before, the twist DOFs got the linear-shape split, tL/2 and tL/6 / tL/3,
/// and the warping DOFs the exact Vlasov bimoments of a uniform torque with
/// the opposite sign plus a "simplified" triangular term that multiplied its
/// shape functions by zero — loads consistent with no element. Found by
/// tests/symbolic_elements.rs; the function had no callers.)
/// `e`, `cw`, `g`, `j` are kept for the signature: consistent loads do not
/// depend on the section.
///
/// DOF layout: [ux, uy, uz, rx, ry, rz, φ', ux, uy, uz, rx, ry, rz, φ']
pub fn fef_distributed_torsion_warping(
    t_i: f64,
    t_j: f64,
    l: f64,
    _e: f64,
    _cw: f64,
    _g: f64,
    _j: f64,
) -> [f64; 14] {
    let mut fef = [0.0; 14];
    fef[3] = l * (7.0 * t_i + 3.0 * t_j) / 20.0;
    fef[6] = l * l * (3.0 * t_i + 2.0 * t_j) / 60.0;
    fef[10] = l * (3.0 * t_i + 7.0 * t_j) / 20.0;
    fef[13] = -l * l * (2.0 * t_i + 3.0 * t_j) / 60.0;
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
        let fef = fef_distributed_2d(-10.0, -10.0, 6.0, 0.0);
        // V = qL/2 = -10*6/2 = -30, but FEF are reactions → +30
        assert!((fef[1] - (-30.0)).abs() < 1e-6);
        assert!((fef[4] - (-30.0)).abs() < 1e-6);
        // M = qL²/12 = -10*36/12 = -30
        assert!((fef[2] - (-30.0)).abs() < 1e-6);
        assert!((fef[5] - 30.0).abs() < 1e-6);
    }

    /// The partial-load integration is exact: over [0, L] it reproduces the
    /// closed-form trapezoid, and split at any c it is additive. (The former
    /// 20-panel Simpson rule missed the degree-4 term by ~1e-6 relative.)
    #[test]
    fn test_fef_partial_is_exact() {
        let (l, qi, qj) = (7.3, -12.0, 31.0);
        let full = fef_distributed_2d(qi, qj, l, 0.0);
        let part = fef_partial_distributed_2d(qi, qj, 0.0, l, l, 0.0);
        let c = 2.9;
        let qc = qi + (qj - qi) * c / l;
        let left = fef_partial_distributed_2d(qi, qc, 0.0, c, l, 0.0);
        let right = fef_partial_distributed_2d(qc, qj, c, l, l, 0.0);
        for k in 0..6 {
            let scale = full[k].abs().max(1.0);
            assert!((part[k] - full[k]).abs() < 1e-13 * scale, "k={k}: {} vs {}", part[k], full[k]);
            assert!((left[k] + right[k] - full[k]).abs() < 1e-13 * scale, "k={k}");
        }
    }

    /// Equivalent loads must be statically equivalent to the couple they
    /// replace: no net force, and a moment of exactly M about node i.
    #[test]
    fn test_fef_point_couple_is_statically_equivalent() {
        let (l, m) = (5.0, 6.0);
        for &a in &[0.0, 1.0, 2.0, 2.5, 4.0, 5.0] {
            let f = fef_point_load_2d(0.0, 0.0, m, a, l, 0.0);
            assert!((f[1] + f[4]).abs() < 1e-12, "a = {a}: net force {}", f[1] + f[4]);
            let about_i = f[2] + f[5] + f[4] * l;
            assert!((about_i - m).abs() < 1e-12, "a = {a}: moment about i {about_i}, want {m}");
        }
    }

    /// At a = 2 on a 5 m bar: M·N'(a) for each Hermite shape function.
    #[test]
    fn test_fef_point_couple_values() {
        let f = fef_point_load_2d(0.0, 0.0, 6.0, 2.0, 5.0, 0.0);
        assert!((f[1] - (-1.728)).abs() < 1e-12);
        assert!((f[2] - (-0.72)).abs() < 1e-12);
        assert!((f[4] - 1.728).abs() < 1e-12);
        assert!((f[5] - (-1.92)).abs() < 1e-12);
    }

    // ---------------- Timoshenko: independent force-method reference ----------------
    //
    // Fixed-end forces of a shear-flexible beam solved directly (force method),
    // without the element shape functions: with m = EI·ψ' (sagging), s = m',
    // s' = q, v' = ψ − s/(G·As), integrate from x = 0:
    //   m(x) = m0 + s0·x + m_q(x),         m_q(x) = ∫₀ˣ (x − t) q(t) dt
    //   ψ(L) = θ_i + (m0 L + s0 L²/2 + ∫₀ᴸ m_q)/EI
    //   v(L) = θ_i L + (m0 L²/2 + s0 L³/6 + ∫₀ᴸ(L − x) m_q)/EI − (s0 L + ∫₀ᴸ s_q)/GAs
    // where s_q is the shear of the loads alone (a couple steps m but carries
    // no shear, so for forces ∫₀ᴸ s_q = m_q(L) and for a couple it is 0)
    // and impose the end conditions (θ_i = 0 or m(0) = 0; v(L) = 0; ψ(L) = 0
    // or m(L) = 0). The equivalent nodal loads are [−s(0), m(0), s(L), −m(L)].

    #[derive(Clone, Copy)]
    enum Ld {
        Point { a: f64, p: f64 },
        Couple { a: f64, c: f64 },
        Dist { a: f64, b: f64, qa: f64, qb: f64 },
    }

    /// Returns (m_q(L), ∫m_q, ∫(L−x)m_q, s_q(L), ∫s_q).
    fn load_integrals(ld: Ld, l: f64) -> [f64; 5] {
        match ld {
            Ld::Point { a, p } => {
                let b = l - a;
                [p * b, p * b * b / 2.0, p * b.powi(3) / 6.0, p, p * b]
            }
            // A counter-clockwise couple steps the sagging moment down by c.
            Ld::Couple { a, c } => {
                let b = l - a;
                [-c, -c * b, -c * b * b / 2.0, 0.0, 0.0]
            }
            Ld::Dist { a, b, qa, qb } => {
                // Superpose point loads q(t)dt: composite Simpson, 2000 panels.
                let n = 2000;
                let h = (b - a) / n as f64;
                let mut out = [0.0; 5];
                for k in 0..=n {
                    let t = a + k as f64 * h;
                    let w = if k == 0 || k == n { 1.0 } else if k % 2 == 1 { 4.0 } else { 2.0 };
                    let q = qa + (qb - qa) * (t - a) / (b - a);
                    let f = load_integrals(Ld::Point { a: t, p: q * w * h / 3.0 }, l);
                    for i in 0..5 {
                        out[i] += f[i];
                    }
                }
                out
            }
        }
    }

    /// Equivalent nodal loads [V_i, M_i, V_j, M_j] of the shear-flexible beam
    /// (EI = 1, φ = 12EI/(G·As·L²)) with optional end releases.
    fn reference_fef(loads: &[Ld], l: f64, phi: f64, hs: bool, he: bool) -> [f64; 4] {
        let ei = 1.0;
        let flex_s = phi * l * l / (12.0 * ei); // 1/(G·As)
        let mut ig = [0.0; 5];
        for &ld in loads {
            let f = load_integrals(ld, l);
            for i in 0..5 {
                ig[i] += f[i];
            }
        }
        let [mql, mq1, mq2, sql, isq] = ig;
        // unknowns x = [θ_i, m0, s0]; rows A x = rhs
        let r1 = if hs { ([0.0, 1.0, 0.0], 0.0) } else { ([1.0, 0.0, 0.0], 0.0) };
        let r2 = ([l, l * l / (2.0 * ei), l.powi(3) / (6.0 * ei) - flex_s * l], -(mq2 / ei - flex_s * isq));
        let r3 = if he {
            ([0.0, 1.0, l], -mql)
        } else {
            ([1.0, l / ei, l * l / (2.0 * ei)], -mq1 / ei)
        };
        let a = [r1.0, r2.0, r3.0];
        let rhs = [r1.1, r2.1, r3.1];
        let det = |m: [[f64; 3]; 3]| {
            m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
                + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
        };
        let d = det(a);
        let mut x = [0.0; 3];
        for c in 0..3 {
            let mut m = a;
            for r in 0..3 {
                m[r][c] = rhs[r];
            }
            x[c] = det(m) / d;
        }
        let (m0, s0) = (x[1], x[2]);
        let m_l = m0 + s0 * l + mql;
        [-s0, m0, s0 + sql, -m_l]
    }

    fn fef_2d_of(ld: Ld, l: f64, phi: f64) -> [f64; 6] {
        match ld {
            Ld::Point { a, p } => fef_point_load_2d(p, 0.0, 0.0, a, l, phi),
            Ld::Couple { a, c } => fef_point_load_2d(0.0, 0.0, c, a, l, phi),
            Ld::Dist { a, b, qa, qb } if a == 0.0 && b == l => fef_distributed_2d(qa, qb, l, phi),
            Ld::Dist { a, b, qa, qb } => fef_partial_distributed_2d(qa, qb, a, b, l, phi),
        }
    }

    fn sample_loads(l: f64) -> Vec<Ld> {
        vec![
            Ld::Point { a: 0.25 * l, p: -10.0 },
            Ld::Point { a: 0.5 * l, p: 7.0 },
            Ld::Point { a: 0.9 * l, p: -3.0 },
            Ld::Couple { a: 0.3 * l, c: 6.0 },
            Ld::Couple { a: 0.75 * l, c: -4.0 },
            Ld::Dist { a: 0.0, b: l, qa: -5.0, qb: -5.0 },
            Ld::Dist { a: 0.0, b: l, qa: -2.0, qb: 9.0 },
            Ld::Dist { a: 0.2 * l, b: 0.7 * l, qa: -8.0, qb: 3.0 },
            Ld::Dist { a: 0.0, b: 0.4 * l, qa: 4.0, qb: 4.0 },
        ]
    }

    fn assert_close4(got: [f64; 4], want: [f64; 4], scale: f64, ctx: &str) {
        for k in 0..4 {
            assert!(
                (got[k] - want[k]).abs() <= 1e-9 * scale,
                "{ctx}: k={k} got {:?} want {:?}",
                got,
                want
            );
        }
    }

    /// 2D: point loads, couples, full and partial trapezoids, with every
    /// combination of end releases, for several φ, against the force method.
    #[test]
    fn test_timoshenko_fef_2d_matches_force_method() {
        let l = 3.7;
        for &phi in &[0.0, 0.05, 0.6, 3.0, 25.0] {
            for ld in sample_loads(l) {
                for &(hs, he) in &[(false, false), (true, false), (false, true), (true, true)] {
                    let mut f = fef_2d_of(ld, l, phi);
                    adjust_fef_for_hinges(&mut f, l, hs, he, phi);
                    let want = reference_fef(&[ld], l, phi, hs, he);
                    let scale = want.iter().fold(1.0f64, |m, v| m.max(v.abs()));
                    let ctx = format!("phi={phi} hs={hs} he={he}");
                    assert_close4([f[1], f[2], f[4], f[5]], want, scale, &ctx);
                }
            }
        }
    }

    /// The shear correction matters: φ = 0 and φ > 0 differ for a point load
    /// (the bug), but coincide for a uniform full-length load.
    #[test]
    fn test_timoshenko_fef_differs_from_eb_except_udl() {
        let (l, phi) = (2.0, 0.4);
        let eb = fef_point_load_2d(-10.0, 0.0, 0.0, 0.5, l, 0.0);
        let ti = fef_point_load_2d(-10.0, 0.0, 0.0, 0.5, l, phi);
        assert!((eb[2] - ti[2]).abs() > 1e-3);
        let eb = fef_distributed_2d(-4.0, -4.0, l, 0.0);
        let ti = fef_distributed_2d(-4.0, -4.0, l, phi);
        for k in 0..6 {
            assert!((eb[k] - ti[k]).abs() < 1e-12);
        }
    }

    /// The README closed form (EB fixed-end forces + simply supported
    /// reactions) equals the shape-function integral, for transverse forces.
    #[test]
    fn test_timoshenko_readme_formula() {
        let (l, phi) = (4.2, 1.7);
        for &a in &[0.3, 1.1, 2.1, 3.9] {
            let eb = fef_point_load_2d(5.0, 0.0, 0.0, a, l, 0.0);
            let ti = fef_point_load_2d(5.0, 0.0, 0.0, a, l, phi);
            let c = shear_correct(eb[1], eb[2], eb[4], eb[5], l, phi);
            assert_close4([ti[1], ti[2], ti[4], ti[5]], c, 10.0, "readme");
        }
    }

    /// 3D: both bending planes with their own φ (local-y load ↔ φ_z, local-z
    /// load ↔ φ_y; θy = −dw/dx flips the z-plane moments), with releases.
    #[test]
    fn test_timoshenko_fef_3d_both_planes_match_force_method() {
        let l = 2.9;
        let (phi_y, phi_z) = (1.3, 0.2);
        let loads_y = sample_loads(l);
        let loads_z: Vec<Ld> = sample_loads(l)
            .into_iter()
            .map(|ld| match ld {
                Ld::Point { a, p } => Ld::Point { a, p: -0.7 * p + 1.0 },
                Ld::Dist { a, b, qa, qb } => Ld::Dist { a, b, qa: 0.5 * qb - 1.0, qb: 2.0 * qa },
                c => c,
            })
            .collect();
        let bools = [false, true];
        for (ly, lz) in loads_y.iter().zip(&loads_z) {
            let mut f = match (*ly, *lz) {
                (Ld::Point { a, p: py }, Ld::Point { p: pz, .. }) => fef_point_load_3d(py, pz, a, l, phi_y, phi_z),
                (Ld::Dist { a, b, qa: yi, qb: yj }, Ld::Dist { qa: zi, qb: zj, .. }) => {
                    if a == 0.0 && b == l {
                        fef_distributed_3d(yi, yj, zi, zj, l, phi_y, phi_z)
                    } else {
                        fef_partial_distributed_3d(yi, yj, zi, zj, a, b, l, phi_y, phi_z)
                    }
                }
                _ => continue, // no 3D member couples
            };
            let f0 = f;
            for &mzs in &bools {
                for &mze in &bools {
                    for &mys in &bools {
                        for &mye in &bools {
                            f = f0;
                            let h = super::super::frame::Hinge3D {
                                release_mz_start: mzs,
                                release_mz_end: mze,
                                release_my_start: mys,
                                release_my_end: mye,
                                ..Default::default()
                            };
                            adjust_fef_for_hinges_3d(&mut f, l, h, phi_y, phi_z);
                            let wy = reference_fef(&[*ly], l, phi_z, mzs, mze);
                            let wz = reference_fef(&[*lz], l, phi_y, mys, mye);
                            let sy = wy.iter().fold(1.0f64, |m, v| m.max(v.abs()));
                            let sz = wz.iter().fold(1.0f64, |m, v| m.max(v.abs()));
                            assert_close4([f[1], f[5], f[7], f[11]], wy, sy, "y-plane");
                            assert_close4([f[2], -f[4], f[8], -f[10]], wz, sz, "z-plane");
                        }
                    }
                }
            }
        }
    }

    #[test]
    fn test_fef_point_load() {
        // Midspan point load on 6m beam
        let fef = fef_point_load_2d(-10.0, 0.0, 0.0, 3.0, 6.0, 0.0);
        // V_i = V_j = P/2 = -5
        assert!((fef[1] - (-5.0)).abs() < 1e-6);
        assert!((fef[4] - (-5.0)).abs() < 1e-6);
        // M_i = PL/8 = -10*6/8 = -7.5, M_j = -PL/8 = 7.5
        assert!((fef[2] - (-7.5)).abs() < 1e-6);
        assert!((fef[5] - 7.5).abs() < 1e-6);
    }
}

/// Consistent axial nodal forces of a trapezoid on [a,b], per unit member length.
/// Integrates the linear axial shape functions, retaining couples of opposite-sign ends.
pub fn axial_distributed_fef(q_i: f64, q_j: f64, a: f64, b: f64, l: f64) -> [f64; 2] {
    let span = b - a;
    if span <= 0.0 { return [0.0, 0.0]; }
    let f_i = q_i * span / 2.0;
    let f_j = q_j * span / 2.0;
    let at_j = (f_i * (a + span / 3.0) + f_j * (a + 2.0 * span / 3.0)) / l;
    [f_i + f_j - at_j, at_j]
}
