/// Connector elements: zero-length or finite-length spring/dashpot between two nodes.
///
/// Assembles into global K as a 2-node element with user-specified stiffness
/// along each DOF direction. Useful for modeling bearings, isolators, gaps, etc.

use crate::types::ConnectorElement;
use crate::solver::dof::DofNumbering;
use std::collections::HashMap;

/// Build the 2D connector element stiffness matrix (6×6 for frame-DOF nodes).
///
/// The connector acts along the line between nodes i and j. If the nodes
/// coincide (zero-length), it acts in the global coordinate system.
///
/// Stiffness values:
///   k_axial  — along the connector axis
///   k_shear  — perpendicular to axis (in-plane)
///   k_moment — rotational spring about Z
pub fn connector_stiffness_2d(
    k_axial: f64,
    k_shear: f64,
    k_moment: f64,
    cos: f64,
    sin: f64,
) -> [f64; 36] {
    // Local stiffness: spring between DOFs of nodes i and j.
    // k_local = [ K_ii  -K_ii ]
    //           [-K_ii   K_ii ]
    // where K_ii = diag(k_axial, k_shear, k_moment) in local coords.
    //
    // Transform to global: K_global = T^T * K_local * T

    let c = cos;
    let s = sin;

    // Stiffness components in global coords
    let kxx = k_axial * c * c + k_shear * s * s;
    let kyy = k_axial * s * s + k_shear * c * c;
    let kxy = (k_axial - k_shear) * c * s;
    let krz = k_moment;

    // 6×6 matrix: [node_i(ux,uy,rz), node_j(ux,uy,rz)]
    let mut k = [0.0; 36];

    // K_ii block (top-left 3×3)
    k[0 * 6 + 0] = kxx;
    k[0 * 6 + 1] = kxy;
    k[1 * 6 + 0] = kxy;
    k[1 * 6 + 1] = kyy;
    k[2 * 6 + 2] = krz;

    // K_jj block (bottom-right 3×3) — same as K_ii
    k[3 * 6 + 3] = kxx;
    k[3 * 6 + 4] = kxy;
    k[4 * 6 + 3] = kxy;
    k[4 * 6 + 4] = kyy;
    k[5 * 6 + 5] = krz;

    // K_ij and K_ji blocks (off-diagonal, negative)
    k[0 * 6 + 3] = -kxx;
    k[0 * 6 + 4] = -kxy;
    k[1 * 6 + 3] = -kxy;
    k[1 * 6 + 4] = -kyy;
    k[2 * 6 + 5] = -krz;

    k[3 * 6 + 0] = -kxx;
    k[3 * 6 + 1] = -kxy;
    k[4 * 6 + 0] = -kxy;
    k[4 * 6 + 1] = -kyy;
    k[5 * 6 + 2] = -krz;

    k
}

/// Build the 3D connector element stiffness matrix (12×12 for 6-DOF nodes).
pub fn connector_stiffness_3d(
    k_axial: f64,
    k_shear_y: f64,
    k_shear_z: f64,
    k_torsion: f64,
    k_bend_y: f64,
    k_bend_z: f64,
    dir: [f64; 3],  // unit direction from node_i to node_j (or [1,0,0] for zero-length)
) -> [f64; 144] {
    // Build local-to-global rotation from direction vector
    // Local x = dir, local y and z are perpendicular
    let (lx, ly, lz) = (dir[0], dir[1], dir[2]);

    // Choose a reference vector not parallel to dir
    let ref_vec = if lx.abs() < 0.9 { [1.0, 0.0, 0.0] } else { [0.0, 1.0, 0.0] };

    // local_y = ref × dir (normalized)
    let mut yy = [
        ref_vec[1] * lz - ref_vec[2] * ly,
        ref_vec[2] * lx - ref_vec[0] * lz,
        ref_vec[0] * ly - ref_vec[1] * lx,
    ];
    let yn = (yy[0] * yy[0] + yy[1] * yy[1] + yy[2] * yy[2]).sqrt();
    if yn > 1e-15 {
        yy[0] /= yn; yy[1] /= yn; yy[2] /= yn;
    }

    // local_z = dir × local_y
    let zz = [
        ly * yy[2] - lz * yy[1],
        lz * yy[0] - lx * yy[2],
        lx * yy[1] - ly * yy[0],
    ];

    // Rotation matrix R (3×3): rows are local x, y, z in global components
    let r = [
        [lx, ly, lz],
        [yy[0], yy[1], yy[2]],
        [zz[0], zz[1], zz[2]],
    ];

    // Local diagonal stiffness for one node: [k_axial, k_shear_y, k_shear_z, k_torsion, k_bend_y, k_bend_z]
    let kd = [k_axial, k_shear_y, k_shear_z, k_torsion, k_bend_y, k_bend_z];

    // Transform: K_global_block = R^T * diag(k) * R for translation and rotation blocks
    // Build 6×6 global block for node pair
    let mut kg = [[0.0f64; 6]; 6];

    // Translation block (3×3): R^T * diag(kd[0..3]) * R
    for i in 0..3 {
        for j in 0..3 {
            let mut s = 0.0;
            for p in 0..3 {
                s += r[p][i] * kd[p] * r[p][j];
            }
            kg[i][j] = s;
        }
    }

    // Rotation block (3×3): R^T * diag(kd[3..6]) * R
    for i in 0..3 {
        for j in 0..3 {
            let mut s = 0.0;
            for p in 0..3 {
                s += r[p][i] * kd[3 + p] * r[p][j];
            }
            kg[3 + i][3 + j] = s;
        }
    }

    // Assemble 12×12: [K_ii, -K_ii; -K_ii, K_ii]
    let mut k = [0.0; 144];
    for i in 0..6 {
        for j in 0..6 {
            let v = kg[i][j];
            k[i * 12 + j] = v;           // K_ii
            k[(6 + i) * 12 + (6 + j)] = v;  // K_jj
            k[i * 12 + (6 + j)] = -v;    // K_ij
            k[(6 + i) * 12 + j] = -v;    // K_ji
        }
    }

    k
}

/// Assemble 2D connector elements into an existing global stiffness matrix.
///
/// Connectors are assembled like frame elements (6 DOFs per connector: 3 per node).
pub fn assemble_connectors_2d(
    connectors: &HashMap<String, ConnectorElement>,
    nodes_2d: &HashMap<String, crate::types::SolverNode>,
    dof_num: &DofNumbering,
    k_global: &mut [f64],
    n: usize,
) {
    let node_by_id: HashMap<usize, &crate::types::SolverNode> =
        nodes_2d.values().map(|nd| (nd.id, nd)).collect();

    for conn in connectors.values() {
        let ni = match node_by_id.get(&conn.node_i) { Some(n) => n, None => continue };
        let nj = match node_by_id.get(&conn.node_j) { Some(n) => n, None => continue };

        let dx = nj.x - ni.x;
        let dy = nj.z - ni.z;
        let l = (dx * dx + dy * dy).sqrt();
        let (cos, sin) = if l > 1e-15 { (dx / l, dy / l) } else { (1.0, 0.0) };

        let ke = connector_stiffness_2d(conn.k_axial, conn.k_shear, conn.k_moment, cos, sin);

        let dofs = dof_num.element_dofs(conn.node_i, conn.node_j);
        let ndof = dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_global[dofs[i] * n + dofs[j]] += ke[i * 6 + j];
            }
        }
    }
}

/// Assemble 3D connector elements into an existing global stiffness matrix.
pub fn assemble_connectors_3d(
    connectors: &HashMap<String, ConnectorElement>,
    nodes_3d: &HashMap<String, crate::types::SolverNode3D>,
    dof_num: &DofNumbering,
    k_global: &mut [f64],
    n: usize,
) {
    let node_by_id: HashMap<usize, &crate::types::SolverNode3D> =
        nodes_3d.values().map(|nd| (nd.id, nd)).collect();

    for conn in connectors.values() {
        let ni = match node_by_id.get(&conn.node_i) { Some(n) => n, None => continue };
        let nj = match node_by_id.get(&conn.node_j) { Some(n) => n, None => continue };

        let dx = nj.x - ni.x;
        let dy = nj.y - ni.y;
        let dz = nj.z - ni.z;
        let l = (dx * dx + dy * dy + dz * dz).sqrt();
        let dir = if l > 1e-15 {
            [dx / l, dy / l, dz / l]
        } else {
            [1.0, 0.0, 0.0]
        };

        let ke = connector_stiffness_3d(
            conn.k_axial, conn.k_shear, conn.k_shear_z,
            conn.k_moment, conn.k_bend_y, conn.k_bend_z, dir,
        );

        let dofs = dof_num.element_dofs(conn.node_i, conn.node_j);
        let ndof = dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_global[dofs[i] * n + dofs[j]] += ke[i * 12 + j];
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_connector_2d_axial_only() {
        // Pure axial spring along X (cos=1, sin=0)
        let k = connector_stiffness_2d(100.0, 0.0, 0.0, 1.0, 0.0);
        // K_ii[0,0] = 100, K_jj[0,0] = 100, K_ij[0,0] = -100
        assert!((k[0 * 6 + 0] - 100.0).abs() < 1e-10);
        assert!((k[3 * 6 + 3] - 100.0).abs() < 1e-10);
        assert!((k[0 * 6 + 3] + 100.0).abs() < 1e-10);
        // No shear or moment terms
        assert!(k[1 * 6 + 1].abs() < 1e-10);
        assert!(k[2 * 6 + 2].abs() < 1e-10);
    }

    #[test]
    fn test_connector_2d_symmetry() {
        let k = connector_stiffness_2d(100.0, 50.0, 25.0, 0.6, 0.8);
        for i in 0..6 {
            for j in 0..6 {
                assert!(
                    (k[i * 6 + j] - k[j * 6 + i]).abs() < 1e-10,
                    "Asymmetry at ({},{}): {} vs {}", i, j, k[i * 6 + j], k[j * 6 + i]
                );
            }
        }
    }

    #[test]
    fn test_connector_3d_axial_only() {
        let k = connector_stiffness_3d(100.0, 0.0, 0.0, 0.0, 0.0, 0.0, [1.0, 0.0, 0.0]);
        // Axial along X: k[0,0] = 100
        assert!((k[0 * 12 + 0] - 100.0).abs() < 1e-10);
        assert!((k[6 * 12 + 6] - 100.0).abs() < 1e-10);
        assert!((k[0 * 12 + 6] + 100.0).abs() < 1e-10);
    }

    #[test]
    fn test_connector_3d_symmetry() {
        let k = connector_stiffness_3d(100.0, 50.0, 30.0, 10.0, 5.0, 3.0, [0.577, 0.577, 0.577]);
        for i in 0..12 {
            for j in 0..12 {
                assert!(
                    (k[i * 12 + j] - k[j * 12 + i]).abs() < 1e-8,
                    "Asymmetry at ({},{})", i, j
                );
            }
        }
    }
}
