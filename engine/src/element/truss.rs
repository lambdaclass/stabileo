/// 2D truss local stiffness matrix (4×4).
/// DOFs: [u1, v1, u2, v2]
/// Only axial stiffness.
pub fn truss_local_stiffness_2d(e: f64, a: f64, l: f64) -> Vec<f64> {
    let ea_l = e * a / l;
    vec![
        ea_l, 0.0, -ea_l, 0.0,
        0.0,  0.0,  0.0,  0.0,
       -ea_l, 0.0,  ea_l, 0.0,
        0.0,  0.0,  0.0,  0.0,
    ]
}

/// 3D truss local stiffness matrix (6×6).
/// DOFs: [u1, v1, w1, u2, v2, w2]
/// Only axial stiffness.
pub fn truss_local_stiffness_3d(e: f64, a: f64, l: f64) -> Vec<f64> {
    let ea_l = e * a / l;
    let mut k = vec![0.0; 36];
    k[0 * 6 + 0] = ea_l;
    k[0 * 6 + 3] = -ea_l;
    k[3 * 6 + 0] = -ea_l;
    k[3 * 6 + 3] = ea_l;
    k
}

/// 2D truss global stiffness matrix directly (4×4).
/// More efficient than local + transform for trusses.
pub fn truss_global_stiffness_2d(e: f64, a: f64, l: f64, cos: f64, sin: f64) -> Vec<f64> {
    let ea_l = e * a / l;
    // Each distinct product computed once: symmetric entries are then the same
    // f64 value by construction (and Kani need not prove two rounded products equal).
    let kc2 = ea_l * (cos * cos);
    let ks2 = ea_l * (sin * sin);
    let kcs = ea_l * (cos * sin);

    vec![
         kc2,  kcs, -kc2, -kcs,
         kcs,  ks2, -kcs, -ks2,
        -kc2, -kcs,  kc2,  kcs,
        -kcs, -ks2,  kcs,  ks2,
    ]
}

/// 3D truss global stiffness matrix directly (6×6) using direction cosines.
/// More efficient than local + transform for trusses.
/// DOFs: [ux_i, uy_i, uz_i, ux_j, uy_j, uz_j]
pub fn truss_global_stiffness_3d(e: f64, a: f64, l: f64, dx: f64, dy: f64, dz: f64) -> Vec<f64> {
    let ea_l = e * a / l;
    let dir = [dx / l, dy / l, dz / l];
    let mut k = vec![0.0; 36];

    for i in 0..3 {
        for j in 0..3 {
            let val = ea_l * dir[i] * dir[j];
            k[i * 6 + j] = val;
            k[i * 6 + (j + 3)] = -val;
            k[(i + 3) * 6 + j] = -val;
            k[(i + 3) * 6 + (j + 3)] = val;
        }
    }

    k
}

/// Scatter a 3D truss global stiffness matrix into the global K.
/// Uses the DOF map to handle both 6-DOF and 7-DOF (warping) node layouts.
pub fn scatter_truss_3d(
    k_global: &mut [f64],
    n: usize,
    ea_l: f64,
    dir: &[f64; 3],
    node_i: usize,
    node_j: usize,
    dof_map: &std::collections::HashMap<(usize, usize), usize>,
) {
    let nodes = [node_i, node_j];
    for a in 0..2 {
        for b in 0..2 {
            let sign = if a == b { 1.0 } else { -1.0 };
            for i in 0..3 {
                for j in 0..3 {
                    if let (Some(&da), Some(&db)) = (
                        dof_map.get(&(nodes[a], i)),
                        dof_map.get(&(nodes[b], j)),
                    ) {
                        k_global[da * n + db] += sign * ea_l * dir[i] * dir[j];
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_truss_symmetry() {
        let k = truss_global_stiffness_2d(200e6, 0.001, 5.0, 0.6, 0.8);
        for i in 0..4 {
            for j in 0..4 {
                assert!(
                    (k[i * 4 + j] - k[j * 4 + i]).abs() < 1e-6,
                    "Truss K not symmetric at ({},{})",
                    i, j
                );
            }
        }
    }

    #[test]
    fn test_truss_horizontal() {
        // Horizontal truss: cos=1, sin=0
        let k = truss_global_stiffness_2d(200e6, 0.001, 5.0, 1.0, 0.0);
        let ea_l = 200e6 * 0.001 / 5.0;
        assert!((k[0] - ea_l).abs() < 1e-6);
        assert!((k[1]).abs() < 1e-10); // No coupling
    }
}
