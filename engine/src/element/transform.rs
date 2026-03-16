/// 2D transformation matrix (6×6) from local to global.
/// cos, sin from element angle.
pub fn frame_transform_2d(cos: f64, sin: f64) -> Vec<f64> {
    let mut t = vec![0.0; 36];
    // Node I
    t[0 * 6 + 0] = cos;
    t[0 * 6 + 1] = sin;
    t[1 * 6 + 0] = -sin;
    t[1 * 6 + 1] = cos;
    t[2 * 6 + 2] = 1.0;
    // Node J
    t[3 * 6 + 3] = cos;
    t[3 * 6 + 4] = sin;
    t[4 * 6 + 3] = -sin;
    t[4 * 6 + 4] = cos;
    t[5 * 6 + 5] = 1.0;
    t
}

/// 2D transformation matrix for truss (4×4).
pub fn truss_transform_2d(cos: f64, sin: f64) -> Vec<f64> {
    vec![
        cos, sin, 0.0, 0.0,
       -sin, cos, 0.0, 0.0,
        0.0, 0.0, cos, sin,
        0.0, 0.0,-sin, cos,
    ]
}

/// Compute local axes for a 3D element.
/// Returns (ex, ey, ez) unit vectors in global coordinates.
/// ex = element axis (I→J)
/// ey = local Y (perpendicular, in the plane defined by orientation vector)
/// ez = ey × ex (right-hand rule)
pub fn compute_local_axes_3d(
    xi: f64, yi: f64, zi: f64,
    xj: f64, yj: f64, zj: f64,
    local_yx: Option<f64>,
    local_yy: Option<f64>,
    local_yz: Option<f64>,
    roll_angle: Option<f64>,
    left_hand: bool,
) -> ([f64; 3], [f64; 3], [f64; 3]) {
    let dx = xj - xi;
    let dy = yj - yi;
    let dz = zj - zi;
    let l = (dx * dx + dy * dy + dz * dz).sqrt();

    let ex = [dx / l, dy / l, dz / l];

    // Determine reference vector for local Y
    let ey_ref = if let (Some(lyx), Some(lyy), Some(lyz)) = (local_yx, local_yy, local_yz) {
        let mag = (lyx * lyx + lyy * lyy + lyz * lyz).sqrt();
        if mag > 1e-10 {
            [lyx / mag, lyy / mag, lyz / mag]
        } else {
            default_ey_ref(&ex)
        }
    } else {
        default_ey_ref(&ex)
    };

    // ez = ex × ey_ref (then normalize)
    let mut ez = cross(&ex, &ey_ref);
    let ez_mag = norm(&ez);
    if ez_mag < 1e-10 {
        // ex parallel to ey_ref, use fallback
        let fallback = if ex[0].abs() < 0.9 { [1.0, 0.0, 0.0] } else { [0.0, 1.0, 0.0] };
        ez = cross(&ex, &fallback);
        let ez_mag = norm(&ez);
        ez = [ez[0] / ez_mag, ez[1] / ez_mag, ez[2] / ez_mag];
    } else {
        ez = [ez[0] / ez_mag, ez[1] / ez_mag, ez[2] / ez_mag];
    }

    // ey = ez × ex (guaranteed orthogonal)
    let mut ey = cross(&ez, &ex);
    let ey_mag = norm(&ey);
    ey = [ey[0] / ey_mag, ey[1] / ey_mag, ey[2] / ey_mag];

    // Apply roll angle (rotation about local X)
    let (mut ey, ez) = if let Some(angle_deg) = roll_angle {
        let angle = angle_deg * std::f64::consts::PI / 180.0;
        let c = angle.cos();
        let s = angle.sin();
        let ey_new = [
            c * ey[0] + s * ez[0],
            c * ey[1] + s * ez[1],
            c * ey[2] + s * ez[2],
        ];
        let ez_new = [
            -s * ey[0] + c * ez[0],
            -s * ey[1] + c * ez[1],
            -s * ey[2] + c * ez[2],
        ];
        (ey_new, ez_new)
    } else {
        (ey, ez)
    };

    // Left-hand coordinate system: negate ey
    if left_hand {
        ey = [-ey[0], -ey[1], -ey[2]];
    }

    (ex, ey, ez)
}

/// 3D transformation matrix (12×12) from local axes.
pub fn frame_transform_3d(ex: &[f64; 3], ey: &[f64; 3], ez: &[f64; 3]) -> Vec<f64> {
    let mut t = vec![0.0; 144]; // 12×12
    let n = 12;

    // Rotation matrix R = [ex; ey; ez] (rows are local axes in global coords)
    // Each 3×3 block on the diagonal
    for block in 0..4 {
        let offset = block * 3;
        // Row 0 of block: ex
        t[(offset + 0) * n + (offset + 0)] = ex[0];
        t[(offset + 0) * n + (offset + 1)] = ex[1];
        t[(offset + 0) * n + (offset + 2)] = ex[2];
        // Row 1 of block: ey
        t[(offset + 1) * n + (offset + 0)] = ey[0];
        t[(offset + 1) * n + (offset + 1)] = ey[1];
        t[(offset + 1) * n + (offset + 2)] = ey[2];
        // Row 2 of block: ez
        t[(offset + 2) * n + (offset + 0)] = ez[0];
        t[(offset + 2) * n + (offset + 1)] = ez[1];
        t[(offset + 2) * n + (offset + 2)] = ez[2];
    }

    t
}

/// 3D transformation matrix (14×14) for warping element.
/// Same as 12×12 but with two extra 1×1 identity blocks for warping DOFs (positions 6 and 13).
/// Warping rate (phi') is a scalar invariant under rotation.
pub fn frame_transform_3d_warping(ex: &[f64; 3], ey: &[f64; 3], ez: &[f64; 3]) -> Vec<f64> {
    let mut t = vec![0.0; 196]; // 14×14
    let n = 14;

    // Node I: DOFs 0-5 → two 3×3 rotation blocks
    for block in 0..2 {
        let offset = block * 3;
        t[(offset + 0) * n + (offset + 0)] = ex[0];
        t[(offset + 0) * n + (offset + 1)] = ex[1];
        t[(offset + 0) * n + (offset + 2)] = ex[2];
        t[(offset + 1) * n + (offset + 0)] = ey[0];
        t[(offset + 1) * n + (offset + 1)] = ey[1];
        t[(offset + 1) * n + (offset + 2)] = ey[2];
        t[(offset + 2) * n + (offset + 0)] = ez[0];
        t[(offset + 2) * n + (offset + 1)] = ez[1];
        t[(offset + 2) * n + (offset + 2)] = ez[2];
    }
    // Warping DOF at position 6: identity (1×1)
    t[6 * n + 6] = 1.0;

    // Node J: DOFs 7-12 → two 3×3 rotation blocks
    for block in 0..2 {
        let offset = 7 + block * 3;
        t[(offset + 0) * n + (offset + 0)] = ex[0];
        t[(offset + 0) * n + (offset + 1)] = ex[1];
        t[(offset + 0) * n + (offset + 2)] = ex[2];
        t[(offset + 1) * n + (offset + 0)] = ey[0];
        t[(offset + 1) * n + (offset + 1)] = ey[1];
        t[(offset + 1) * n + (offset + 2)] = ey[2];
        t[(offset + 2) * n + (offset + 0)] = ez[0];
        t[(offset + 2) * n + (offset + 1)] = ez[1];
        t[(offset + 2) * n + (offset + 2)] = ez[2];
    }
    // Warping DOF at position 13: identity (1×1)
    t[13 * n + 13] = 1.0;

    t
}

fn default_ey_ref(ex: &[f64; 3]) -> [f64; 3] {
    // Standard textbook convention:
    //   ez = ex × ref, ey = ez × ex
    // ref = global Y [0,1,0] for non-vertical elements
    // ref = global Z [0,0,1] for vertical elements (|ex·Y| ≈ 1)
    // This produces: local Y ≈ global Y, local Z ≈ global Z for horizontal elements.
    if (ex[1].abs() - 1.0).abs() < 0.01 {
        [0.0, 0.0, 1.0]
    } else {
        [0.0, 1.0, 0.0]
    }
}

fn cross(a: &[f64; 3], b: &[f64; 3]) -> [f64; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn norm(v: &[f64; 3]) -> f64 {
    (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transform_2d_horizontal() {
        let t = frame_transform_2d(1.0, 0.0);
        // Should be identity (horizontal element)
        for i in 0..6 {
            assert!((t[i * 6 + i] - 1.0).abs() < 1e-10);
        }
    }

    #[test]
    fn test_transform_2d_vertical() {
        let t = frame_transform_2d(0.0, 1.0);
        // cos=0, sin=1 → 90° rotation
        assert!((t[0 * 6 + 1] - 1.0).abs() < 1e-10); // local x → global y
        assert!((t[1 * 6 + 0] - (-1.0)).abs() < 1e-10); // local y → -global x
    }

    #[test]
    fn test_local_axes_3d_horizontal() {
        let (ex, ey, ez) = compute_local_axes_3d(
            0.0, 0.0, 0.0, 5.0, 0.0, 0.0,
            None, None, None, None, false,
        );
        assert!((ex[0] - 1.0).abs() < 1e-10);
        assert!((ey[1] - 1.0).abs() < 1e-10);
        assert!((ez[2] - 1.0).abs() < 1e-10);
    }

    // ─── Cross-solver local axes parity tests ────────────────────

    fn dot3(a: &[f64; 3], b: &[f64; 3]) -> f64 {
        a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
    }

    fn norm3(v: &[f64; 3]) -> f64 {
        (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt()
    }

    fn normalize3(v: &[f64; 3]) -> [f64; 3] {
        let n = norm3(v);
        [v[0] / n, v[1] / n, v[2] / n]
    }

    fn det3(r0: &[f64; 3], r1: &[f64; 3], r2: &[f64; 3]) -> f64 {
        dot3(r0, &cross(r1, r2))
    }

    /// Reference algorithm — SAP2000/textbook convention.
    fn expected_axes(dx: f64, dy: f64, dz: f64) -> ([f64; 3], [f64; 3], [f64; 3]) {
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        let ex = [dx / l, dy / l, dz / l];
        let ey_ref = if ex[1].abs() > 0.999 {
            [0.0, 0.0, 1.0]
        } else {
            [0.0, 1.0, 0.0]
        };
        let ez = normalize3(&cross(&ex, &ey_ref));
        let ey = normalize3(&cross(&ez, &ex));
        (ex, ey, ez)
    }

    fn assert_vec_close(actual: &[f64; 3], expected: &[f64; 3], tol: f64) {
        for i in 0..3 {
            assert!(
                (actual[i] - expected[i]).abs() < tol,
                "component {} mismatch: {} vs {} (tol={})",
                i, actual[i], expected[i], tol,
            );
        }
    }

    fn assert_orthonormal_rh(ex: &[f64; 3], ey: &[f64; 3], ez: &[f64; 3], label: &str) {
        let tol = 1e-10;
        assert!(dot3(ex, ey).abs() < tol, "{label}: ex.ey != 0");
        assert!(dot3(ey, ez).abs() < tol, "{label}: ey.ez != 0");
        assert!(dot3(ex, ez).abs() < tol, "{label}: ex.ez != 0");
        assert!((norm3(ex) - 1.0).abs() < tol, "{label}: |ex| != 1");
        assert!((norm3(ey) - 1.0).abs() < tol, "{label}: |ey| != 1");
        assert!((norm3(ez) - 1.0).abs() < tol, "{label}: |ez| != 1");
        assert!((det3(ex, ey, ez) - 1.0).abs() < tol, "{label}: det != 1");
    }

    #[test]
    fn test_local_axes_parity_all_orientations() {
        let cases: Vec<(&str, f64, f64, f64)> = vec![
            ("Horizontal +X",            5.0,  0.0,  0.0),
            ("Horizontal -X",           -5.0,  0.0,  0.0),
            ("Horizontal +Z",            0.0,  0.0,  5.0),
            ("Horizontal -Z",            0.0,  0.0, -5.0),
            ("Vertical +Y",              0.0,  5.0,  0.0),
            ("Vertical -Y",              0.0, -5.0,  0.0),
            ("Diagonal XY (45 deg)",     3.0,  3.0,  0.0),
            ("Diagonal XZ",              3.0,  0.0,  4.0),
            ("Diagonal XYZ (arbitrary)", 3.0,  4.0,  5.0),
        ];

        for (label, dx, dy, dz) in &cases {
            let (ex, ey, ez) = compute_local_axes_3d(
                0.0, 0.0, 0.0, *dx, *dy, *dz,
                None, None, None, None, false,
            );
            let (ref_ex, ref_ey, ref_ez) = expected_axes(*dx, *dy, *dz);

            assert_vec_close(&ex, &ref_ex, 1e-10);
            assert_vec_close(&ey, &ref_ey, 1e-10);
            assert_vec_close(&ez, &ref_ez, 1e-10);
            assert_orthonormal_rh(&ex, &ey, &ez, label);
        }
    }

    #[test]
    fn test_local_axes_roll_angle_orthonormal() {
        let angles = [30.0, 45.0, 90.0, 180.0, -45.0, 270.0];

        for angle in &angles {
            // +X bar
            let (ex, ey, ez) = compute_local_axes_3d(
                0.0, 0.0, 0.0, 5.0, 0.0, 0.0,
                None, None, None, Some(*angle), false,
            );
            assert_orthonormal_rh(&ex, &ey, &ez, &format!("+X roll {angle}"));
            assert_vec_close(&ex, &[1.0, 0.0, 0.0], 1e-10);

            // Diagonal XYZ
            let (ex, ey, ez) = compute_local_axes_3d(
                0.0, 0.0, 0.0, 3.0, 4.0, 5.0,
                None, None, None, Some(*angle), false,
            );
            assert_orthonormal_rh(&ex, &ey, &ez, &format!("diag roll {angle}"));
        }
    }

    #[test]
    fn test_local_axes_roll_90_values() {
        let (_, base_ey, base_ez) = compute_local_axes_3d(
            0.0, 0.0, 0.0, 5.0, 0.0, 0.0,
            None, None, None, None, false,
        );
        let (_, rolled_ey, rolled_ez) = compute_local_axes_3d(
            0.0, 0.0, 0.0, 5.0, 0.0, 0.0,
            None, None, None, Some(90.0), false,
        );
        // After 90 deg roll: ey_new = ez_old, ez_new = -ey_old
        assert_vec_close(&rolled_ey, &base_ez, 1e-10);
        assert_vec_close(&rolled_ez, &[-base_ey[0], -base_ey[1], -base_ey[2]], 1e-10);
    }

    #[test]
    fn test_local_axes_left_hand() {
        let cases: Vec<(f64, f64, f64)> = vec![
            ( 5.0,  0.0,  0.0),
            (-5.0,  0.0,  0.0),
            ( 0.0,  5.0,  0.0),
            ( 0.0, -5.0,  0.0),
            ( 0.0,  0.0,  5.0),
            ( 3.0,  3.0,  0.0),
            ( 3.0,  4.0,  5.0),
        ];

        for (dx, dy, dz) in &cases {
            let (rh_ex, rh_ey, rh_ez) = compute_local_axes_3d(
                0.0, 0.0, 0.0, *dx, *dy, *dz,
                None, None, None, None, false,
            );
            let (lh_ex, lh_ey, lh_ez) = compute_local_axes_3d(
                0.0, 0.0, 0.0, *dx, *dy, *dz,
                None, None, None, None, true,
            );
            let label = format!("leftHand ({dx},{dy},{dz})");
            // ex unchanged
            assert_vec_close(&lh_ex, &rh_ex, 1e-10);
            // ey negated
            assert_vec_close(&lh_ey, &[-rh_ey[0], -rh_ey[1], -rh_ey[2]], 1e-10);
            // ez unchanged
            assert_vec_close(&lh_ez, &rh_ez, 1e-10);
            // det = -1 (left-handed)
            let d = det3(&lh_ex, &lh_ey, &lh_ez);
            assert!(
                (d - (-1.0)).abs() < 1e-10,
                "{label}: det = {d}, expected -1",
            );
        }
    }
}
