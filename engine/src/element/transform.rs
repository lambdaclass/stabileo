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
}
