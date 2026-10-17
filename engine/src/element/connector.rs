/// Connector elements: zero-length or finite-length spring/dashpot between two nodes.
///
/// Assembles into global K as a 2-node element with user-specified stiffness
/// along each DOF direction. Useful for modeling bearings, isolators, gaps, etc.
///
/// Each spring is a compatibility row b (its deformation as a linear function of
/// the end DOFs) and contributes k·b·bᵀ, so K is symmetric and positive
/// semi-definite by construction. The axial and rotational springs measure the
/// relative end displacement / rotation. The shear springs of a finite-length
/// connector act at a point between the nodes, reached from each node by a rigid
/// arm along the axis (`CONNECTOR_SHEAR_POSITION`), so the shear deformation
/// includes the end rotations times the arm and a shear force V carries its
/// moment V·L to the end nodes. Every row vanishes under rigid-body motion. At
/// zero length the arms vanish and K is the plain [K_ii, −K_ii; −K_ii, K_ii].
///
/// DOFs: the element is built with 3 (2D) / 6 (3D) DOFs per node and scattered
/// onto the DOFs the model numbers. In a model without rotation DOFs (all-truss)
/// the rotational springs have nothing to act on and are dropped, as rotational
/// support springs are; a finite-length shear spring there is refused by
/// `validate_connectors`, since it needs the end rotations to carry V·L.

use crate::types::{ConnectorElement, SolverNode, SolverNode3D};
use crate::solver::dof::DofNumbering;
use std::collections::HashMap;

/// Where the shear springs of a finite-length connector act, as a fraction of
/// its length from node i: the midpoint, so V·L is split equally between the
/// ends and the element does not depend on which node is i and which is j.
pub const CONNECTOR_SHEAR_POSITION: f64 = 0.5;

/// Below this length a connector is zero-length and acts in global axes.
const ZERO_LENGTH: f64 = 1e-15;

/// Accumulate k·b·bᵀ into the n×n matrix `out`.
fn add_spring(out: &mut [f64], n: usize, k: f64, b: &[f64]) {
    for i in 0..n {
        if b[i] == 0.0 { continue; }
        for j in 0..n {
            out[i * n + j] += k * b[i] * b[j];
        }
    }
}

/// Build the 2D connector element stiffness matrix (6×6 for frame-DOF nodes).
///
/// The connector acts along the line between nodes i and j, `l` apart. If the
/// nodes coincide (zero-length), it acts in the global coordinate system.
///
/// Stiffness values:
///   k_axial  — along the connector axis
///   k_shear  — perpendicular to axis (in-plane), at `CONNECTOR_SHEAR_POSITION`
///   k_moment — rotational spring about Z
pub fn connector_stiffness_2d(
    k_axial: f64,
    k_shear: f64,
    k_moment: f64,
    cos: f64,
    sin: f64,
    l: f64,
) -> [f64; 36] {
    let (c, s) = (cos, sin);
    let a = CONNECTOR_SHEAR_POSITION;

    // Spring deformations over [ux_i, uz_i, θ_i, ux_j, uz_j, θ_j]. The shear
    // spring sees the transverse relative displacement less the rigid-arm
    // displacements a·L·θ_i and (1 − a)·L·θ_j.
    let axial = [-c, -s, 0.0, c, s, 0.0];
    let shear = [s, -c, -a * l, -s, c, -(1.0 - a) * l];
    let moment = [0.0, 0.0, -1.0, 0.0, 0.0, 1.0];

    let mut k = [0.0; 36];
    add_spring(&mut k, 6, k_axial, &axial);
    add_spring(&mut k, 6, k_shear, &shear);
    add_spring(&mut k, 6, k_moment, &moment);
    k
}

/// Build the 3D connector element stiffness matrix (12×12 for 6-DOF nodes),
/// nodes `l` apart along `dir`.
pub fn connector_stiffness_3d(
    k_axial: f64,
    k_shear_y: f64,
    k_shear_z: f64,
    k_torsion: f64,
    k_bend_y: f64,
    k_bend_z: f64,
    dir: [f64; 3],  // unit direction from node_i to node_j (or [1,0,0] for zero-length)
    l: f64,
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

    let [ex, ey, ez] = r;
    let a = CONNECTOR_SHEAR_POSITION;

    // Spring deformations over [u_i, θ_i, u_j, θ_j] (3 components each). A shear
    // spring along local axis e sees e·(u_j − u_i) + L·(e × ex)·θ̄ with
    // θ̄ = a·θ_i + (1 − a)·θ_j: the relative displacement less the rigid-arm
    // displacements (θ × arm). e × ex is −ez for local y and +ey for local z.
    let trans = |e: [f64; 3], arm: [f64; 3]| -> [f64; 12] {
        let mut b = [0.0; 12];
        for p in 0..3 {
            b[p] = -e[p];
            b[3 + p] = a * l * arm[p];
            b[6 + p] = e[p];
            b[9 + p] = (1.0 - a) * l * arm[p];
        }
        b
    };
    let rot = |e: [f64; 3]| -> [f64; 12] {
        let mut b = [0.0; 12];
        for p in 0..3 {
            b[3 + p] = -e[p];
            b[9 + p] = e[p];
        }
        b
    };

    let mut k = [0.0; 144];
    add_spring(&mut k, 12, k_axial, &trans(ex, [0.0; 3]));
    add_spring(&mut k, 12, k_shear_y, &trans(ey, ez.map(|v| -v)));
    add_spring(&mut k, 12, k_shear_z, &trans(ez, ey));
    add_spring(&mut k, 12, k_torsion, &rot(ex));
    add_spring(&mut k, 12, k_bend_y, &rot(ey));
    add_spring(&mut k, 12, k_bend_z, &rot(ez));
    k
}

/// Global stiffness of one 2D connector (3 DOFs per node, [ux, uz, θ]).
pub fn connector_element_2d(conn: &ConnectorElement, ni: &SolverNode, nj: &SolverNode) -> [f64; 36] {
    let dx = nj.x - ni.x;
    let dy = nj.z - ni.z;
    let l = (dx * dx + dy * dy).sqrt();
    let (cos, sin, l) = if l > ZERO_LENGTH { (dx / l, dy / l, l) } else { (1.0, 0.0, 0.0) };
    connector_stiffness_2d(conn.k_axial, conn.k_shear, conn.k_moment, cos, sin, l)
}

/// Global stiffness of one 3D connector (6 DOFs per node, [u, θ]).
pub fn connector_element_3d(conn: &ConnectorElement, ni: &SolverNode3D, nj: &SolverNode3D) -> [f64; 144] {
    let dx = nj.x - ni.x;
    let dy = nj.y - ni.y;
    let dz = nj.z - ni.z;
    let l = (dx * dx + dy * dy + dz * dz).sqrt();
    let (dir, l) = if l > ZERO_LENGTH { ([dx / l, dy / l, dz / l], l) } else { ([1.0, 0.0, 0.0], 0.0) };
    connector_stiffness_3d(
        conn.k_axial, conn.k_shear, conn.k_shear_z,
        conn.k_moment, conn.k_bend_y, conn.k_bend_z, dir, l,
    )
}

/// Restrict a connector matrix built with `per_node` DOFs per node to the DOFs
/// the model numbers. Returns the global DOFs and the matching ndof×ndof
/// matrix, in the same shape the element assemblers scatter (`ke[i * ndof + j]`
/// onto `dofs`). Element DOFs the model lacks (rotations in an all-truss model)
/// are dropped; DOFs the element lacks (warping) receive nothing.
fn restrict(ke: &[f64], per_node: usize, conn: &ConnectorElement, dof_num: &DofNumbering) -> (Vec<usize>, Vec<f64>) {
    let mut local = Vec::with_capacity(2 * per_node);
    let mut dofs = Vec::with_capacity(2 * per_node);
    for (k, node) in [conn.node_i, conn.node_j].into_iter().enumerate() {
        for d in 0..per_node.min(dof_num.dofs_per_node) {
            if let Some(g) = dof_num.global_dof(node, d) {
                local.push(k * per_node + d);
                dofs.push(g);
            }
        }
    }
    let n = 2 * per_node;
    let m = local.len();
    let mut out = vec![0.0; m * m];
    for (i, &a) in local.iter().enumerate() {
        for (j, &b) in local.iter().enumerate() {
            out[i * m + j] = ke[a * n + b];
        }
    }
    (dofs, out)
}

/// A 2D connector's global DOFs and stiffness, ready to scatter.
pub fn connector_scatter_2d(
    conn: &ConnectorElement, ni: &SolverNode, nj: &SolverNode, dof_num: &DofNumbering,
) -> (Vec<usize>, Vec<f64>) {
    restrict(&connector_element_2d(conn, ni, nj), 3, conn, dof_num)
}

/// A 3D connector's global DOFs and stiffness, ready to scatter.
pub fn connector_scatter_3d(
    conn: &ConnectorElement, ni: &SolverNode3D, nj: &SolverNode3D, dof_num: &DofNumbering,
) -> (Vec<usize>, Vec<f64>) {
    restrict(&connector_element_3d(conn, ni, nj), 6, conn, dof_num)
}

/// Refuse connectors the assemblers cannot represent: a missing end node,
/// non-finite stiffness, or a finite-length shear spring in a model without
/// rotation DOFs (`has_rotations` false), whose moment V·L would be lost.
/// `coords` gives a node's position (2D models pass z = 0 for the third axis).
pub fn validate_connectors(
    connectors: &HashMap<String, ConnectorElement>,
    coords: impl Fn(usize) -> Option<[f64; 3]>,
    has_rotations: bool,
) -> Result<(), String> {
    for c in sorted_by_id(connectors) {
        let pi = coords(c.node_i).ok_or_else(|| format!("Connector {}: node_i {} does not exist", c.id, c.node_i))?;
        let pj = coords(c.node_j).ok_or_else(|| format!("Connector {}: node_j {} does not exist", c.id, c.node_j))?;
        let ks = [c.k_axial, c.k_shear, c.k_moment, c.k_shear_z, c.k_bend_y, c.k_bend_z];
        if ks.iter().any(|k| !k.is_finite()) {
            return Err(format!("Connector {}: stiffness must be finite", c.id));
        }
        let l = ((pj[0] - pi[0]).powi(2) + (pj[1] - pi[1]).powi(2) + (pj[2] - pi[2]).powi(2)).sqrt();
        if !has_rotations && l > ZERO_LENGTH && (c.k_shear != 0.0 || c.k_shear_z != 0.0) {
            return Err(format!(
                "Connector {}: a shear spring on a connector of non-zero length (L = {l:.6}) needs \
                 rotation DOFs to carry its moment V·L, and this model has none (no frame elements). \
                 Make the nodes coincide, set the shear stiffness to 0, or add a frame element.",
                c.id
            ));
        }
    }
    Ok(())
}

/// Connectors in ID order, so the assembled sums do not depend on HashMap order.
pub fn sorted_by_id(connectors: &HashMap<String, ConnectorElement>) -> Vec<&ConnectorElement> {
    let mut sorted: Vec<&ConnectorElement> = connectors.values().collect();
    sorted.sort_by_key(|c| c.id);
    sorted
}

/// Assemble 2D connector elements into an existing global stiffness matrix.
pub fn assemble_connectors_2d(
    connectors: &HashMap<String, ConnectorElement>,
    nodes_2d: &HashMap<String, SolverNode>,
    dof_num: &DofNumbering,
    k_global: &mut [f64],
    n: usize,
) {
    let node_by_id: HashMap<usize, &SolverNode> =
        nodes_2d.values().map(|nd| (nd.id, nd)).collect();

    for conn in sorted_by_id(connectors) {
        let ni = match node_by_id.get(&conn.node_i) { Some(n) => n, None => continue };
        let nj = match node_by_id.get(&conn.node_j) { Some(n) => n, None => continue };
        let (dofs, ke) = connector_scatter_2d(conn, ni, nj, dof_num);
        let ndof = dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_global[dofs[i] * n + dofs[j]] += ke[i * ndof + j];
            }
        }
    }
}

/// Assemble 3D connector elements into an existing global stiffness matrix.
pub fn assemble_connectors_3d(
    connectors: &HashMap<String, ConnectorElement>,
    nodes_3d: &HashMap<String, SolverNode3D>,
    dof_num: &DofNumbering,
    k_global: &mut [f64],
    n: usize,
) {
    let node_by_id: HashMap<usize, &SolverNode3D> =
        nodes_3d.values().map(|nd| (nd.id, nd)).collect();

    for conn in sorted_by_id(connectors) {
        let ni = match node_by_id.get(&conn.node_i) { Some(n) => n, None => continue };
        let nj = match node_by_id.get(&conn.node_j) { Some(n) => n, None => continue };
        let (dofs, ke) = connector_scatter_3d(conn, ni, nj, dof_num);
        let ndof = dofs.len();
        for i in 0..ndof {
            for j in 0..ndof {
                k_global[dofs[i] * n + dofs[j]] += ke[i * ndof + j];
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
        let k = connector_stiffness_2d(100.0, 0.0, 0.0, 1.0, 0.0, 2.0);
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
        let k = connector_stiffness_2d(100.0, 50.0, 25.0, 0.6, 0.8, 1.5);
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
        let k = connector_stiffness_3d(100.0, 0.0, 0.0, 0.0, 0.0, 0.0, [1.0, 0.0, 0.0], 2.0);
        // Axial along X: k[0,0] = 100
        assert!((k[0 * 12 + 0] - 100.0).abs() < 1e-10);
        assert!((k[6 * 12 + 6] - 100.0).abs() < 1e-10);
        assert!((k[0 * 12 + 6] + 100.0).abs() < 1e-10);
    }

    #[test]
    fn test_connector_3d_symmetry() {
        let k = connector_stiffness_3d(100.0, 50.0, 30.0, 10.0, 5.0, 3.0, [0.577, 0.577, 0.577], 1.5);
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
